import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { prisma } from '@/lib/prisma'
import {
  getDecryptedDbUrl,
  getMetricQueries,
  getOrCreateAgentConfig,
  toPublicConfig,
} from '@/lib/retencion/agent-config-store'
import {
  describeTable,
  listPublicTables,
  runReadOnlySelect,
} from '@/lib/retencion/readonly-postgres'
import { maskDbUrl } from '@/lib/retencion/db-url-crypto'
import { derivePeriods, runMetrics } from '@/lib/retencion/metrics/run-metrics'
import { formatMetrics } from '@/lib/retencion/metrics/format-metrics'
import { parseJsonFromModelOutput } from '@/lib/openrouter'
import { BRM_SYNTAX_BLOCK } from '@/lib/retencion/report-prompt'

const MODEL =
  process.env.RETENCION_OPENROUTER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'anthropic/claude-sonnet-4'
const FALLBACK = 'openai/gpt-4o-mini'
const MAX_ROUNDS = 6

const bodySchema = z.object({
  instruction: z.string().min(1).max(4000),
  content: z.string().max(200000).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
})

type ChatMsg = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

const DB_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_tables',
      description: 'Lista tablas del Postgres del cliente (solo lectura).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'describe_table',
      description: 'Describe columnas de una tabla.',
      parameters: {
        type: 'object',
        properties: { schema: { type: 'string' }, table: { type: 'string' } },
        required: ['table'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_select',
      description: 'SELECT o WITH…SELECT de solo lectura para traer datos reales.',
      parameters: {
        type: 'object',
        properties: { sql: { type: 'string' }, limit: { type: 'number' } },
        required: ['sql'],
      },
    },
  },
]

function openRouterHeaders(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada')
  const siteUrl = process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_BASE_URL || ''
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
    'X-OpenRouter-Title': 'Buffalo CRM - editor de informes',
  }
}

async function chat(
  messages: ChatMsg[],
  model: string,
  useTools: boolean
): Promise<{ content: string | null; tool_calls?: ChatMsg['tool_calls'] }> {
  const body: Record<string, unknown> = { model, messages, temperature: 0.3, max_tokens: 8000 }
  if (useTools) {
    body.tools = DB_TOOLS
    body.tool_choice = 'auto'
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatMsg['tool_calls'] } }>
  }
  const msg = data.choices?.[0]?.message
  return { content: msg?.content ?? null, tool_calls: msg?.tool_calls }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    const reportId = String(req.query.reportId || '')
    if (!proyectoId || !reportId) return res.status(400).json({ error: 'params requeridos' })
    await assertProjectAccess(user, proyectoId, res)
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const parsed = bodySchema.parse(req.body || {})

    // Carga el informe
    const rows = await prisma.$queryRawUnsafe<
      { year: number; month: number; audience: string; title: string | null; content: string }[]
    >(
      `SELECT year, month, COALESCE(audience,'client') AS audience, title, content
       FROM retencion_monthly_reports
       WHERE id = $1::uuid AND proyecto_id = $2::uuid LIMIT 1`,
      reportId,
      proyectoId
    )
    const report = rows[0]
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    const currentContent = parsed.content?.trim() || report.content
    const audience = report.audience === 'buffalo' ? 'buffalo' : 'client'

    const cfg = toPublicConfig(await getOrCreateAgentConfig(proyectoId))

    // REAL_METRICS del periodo del informe (usando definiciones cacheadas)
    let realMetricsBlock = ''
    const url = await getDecryptedDbUrl(proyectoId)
    if (url) {
      try {
        const defs = await getMetricQueries(proyectoId)
        if (defs && defs.length) {
          const results = await runMetrics(url, defs, derivePeriods(report.year, report.month))
          const masked = maskDbUrl(url)
          realMetricsBlock = formatMetrics({
            results,
            year: report.year,
            month: report.month,
            host: masked.host,
            db: masked.database,
          })
        }
      } catch {
        /* ignore */
      }
    }

    const system = `Eres un editor de informes Buffalo. Recibes un informe en BRM y una instrucción del usuario. Devuelves el informe BRM COMPLETO con el cambio aplicado.

REGLAS:
- Cambia SOLO lo que pide la instrucción; conserva el resto del informe tal cual.
- Respeta la sintaxis BRM: no rompas directivas, cierra los ":::" que abras.
- No inventes cifras. Si te piden datos que no tienes, usa run_select (BD de solo lectura) para traerlos reales, o marca "Pendiente".
- Español de España, sin emojis, título limpio (sin corchetes).
- Audiencia del informe: ${audience === 'buffalo' ? 'INTERNO Buffalo' : 'CLIENTE'}.

${BRM_SYNTAX_BLOCK}

${realMetricsBlock || '=== REAL_METRICS ===\n(no disponible; usa run_select o marca Pendiente)'}

CONTEXTO DE AUDITORÍA (resumen):
${(cfg.audit_knowledge || '(vacío)').slice(0, 6000)}

Cuando termines, responde SOLO con JSON válido:
{ "content": "<informe BRM completo actualizado>", "note": "<1 frase de qué cambiaste>" }`

    const messages: ChatMsg[] = [{ role: 'system', content: system }]
    for (const m of (parsed.messages || []).slice(-10)) {
      messages.push({ role: m.role, content: m.content })
    }
    messages.push({
      role: 'user',
      content: `INFORME ACTUAL (BRM):\n${currentContent}\n\n─────\nINSTRUCCIÓN: ${parsed.instruction}`,
    })

    let model = MODEL
    let finalText = ''
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let result: Awaited<ReturnType<typeof chat>>
      try {
        result = await chat(messages, model, Boolean(url))
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (model !== FALLBACK && (msg.includes('404') || msg.includes('model') || msg.includes('429'))) {
          model = FALLBACK
          result = await chat(messages, model, Boolean(url))
        } else {
          throw err
        }
      }

      if (result.tool_calls?.length && url) {
        messages.push({ role: 'assistant', content: null, tool_calls: result.tool_calls })
        for (const call of result.tool_calls) {
          const args = parseArgs(call.function.arguments)
          let out: unknown
          try {
            if (call.function.name === 'list_tables') out = await listPublicTables(url)
            else if (call.function.name === 'describe_table')
              out = await describeTable(url, String(args.schema || 'public'), String(args.table || ''))
            else if (call.function.name === 'run_select')
              out = await runReadOnlySelect(url, String(args.sql || ''), {
                limit: args.limit ? Number(args.limit) : 80,
              })
            else out = { error: 'tool desconocida' }
          } catch (e) {
            out = { error: e instanceof Error ? e.message : 'error tool' }
          }
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(out).slice(0, 16000),
          })
        }
        continue
      }

      finalText = (result.content || '').trim()
      break
    }

    if (!finalText) return res.status(502).json({ error: 'El editor no devolvió respuesta' })

    let content = currentContent
    let note = ''
    try {
      const obj = parseJsonFromModelOutput(finalText) as { content?: string; note?: string }
      if (obj.content && typeof obj.content === 'string') content = obj.content
      note = String(obj.note || '')
    } catch {
      // Si no vino JSON, asume que todo el texto es el nuevo contenido BRM
      content = finalText
      note = 'Informe actualizado'
    }

    // Validación mínima de directivas balanceadas
    const fences = (content.match(/^:::/gm) || []).length
    if (fences % 2 !== 0) {
      return res.status(200).json({
        content,
        note: note || 'Actualizado',
        warning: 'Puede que alguna directiva ::: quedara sin cerrar; revísalo.',
      })
    }

    return res.status(200).json({ content, note: note || 'Informe actualizado' })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[retencion/informe/chat]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno' })
  }
}
