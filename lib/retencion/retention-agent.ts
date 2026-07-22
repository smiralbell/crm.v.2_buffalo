import {
  describeTable,
  listPublicTables,
  runReadOnlySelect,
} from './readonly-postgres'
import {
  getDecryptedDbUrl,
  getMetricQueries,
  saveMetricQueries,
  updateAgentConfig,
} from './agent-config-store'
import { maskDbUrl } from './db-url-crypto'
import { discoverMetrics } from './metrics/discover-metrics'
import { derivePeriods, runMetrics } from './metrics/run-metrics'
import { formatMetrics, hasRealData } from './metrics/format-metrics'
import type { RetencionAuditStatus, RetencionChatMessage } from './report-prompt'
import { DEFAULT_RETENCION_REPORT_PROMPT } from './report-prompt'
import { parseJsonFromModelOutput } from '@/lib/openrouter'
import { buildSkillsPromptBlock, KNOWLEDGE_TOOLS } from './knowledge/skills'
import {
  toolLoadCrmKnowledge,
  toolMergeKnowledgeSection,
  toolSeedKnowledgeFromCrm,
  toolUpdateAuditChecklist,
} from './knowledge'

const MODEL =
  process.env.RETENCION_OPENROUTER_MODEL ||
  process.env.DEMO_OPENROUTER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'anthropic/claude-sonnet-4'

const FALLBACK = 'openai/gpt-4o-mini'
const MAX_TOOL_ROUNDS = 10

type ChatMsg = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
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
        properties: {
          schema: { type: 'string' },
          table: { type: 'string' },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_select',
      description: 'SELECT o WITH…SELECT de solo lectura. Nunca escribe.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['sql'],
      },
    },
  },
]

const PERSIST_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'save_knowledge',
      description:
        'Guarda el CONTEXTO DEL PROYECTO completo (documento revisable). Usa mark_ready=true cuando ya sea útil para informes.',
      parameters: {
        type: 'object',
        properties: {
          knowledge: { type: 'string' },
          schema_summary: { type: 'string' },
          mark_ready: { type: 'boolean' },
        },
        required: ['knowledge'],
      },
    },
  },
]

const TOOLS = [...KNOWLEDGE_TOOLS, ...DB_TOOLS, ...PERSIST_TOOLS]

function openRouterHeaders(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no está configurada')
  const siteUrl = process.env.OPENROUTER_HTTP_REFERER || process.env.NEXT_PUBLIC_BASE_URL || ''
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
    'X-OpenRouter-Title': 'Buffalo CRM - retención agent',
  }
}

async function chatWithTools(
  messages: ChatMsg[],
  model: string,
  toolChoice: 'auto' | 'required' | 'none'
): Promise<{ content: string | null; tool_calls?: ChatMsg['tool_calls'] }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.2,
  }
  if (toolChoice !== 'none') {
    body.tools = TOOLS
    body.tool_choice = toolChoice
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: ChatMsg['tool_calls'] }
    }>
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

export type ProyectoContext = {
  id: string
  name: string
  service_type: string
  status: string
  monthly_fee_eur: number | null
  maint_plan: string | null
  has_voz?: boolean
  has_chat?: boolean
  has_dash?: boolean
  contact_nombre?: string | null
  contact_empresa?: string | null
  lead_notas?: string | null
  configuracion_preview?: string | null
}

export type AgentTurnResult = {
  assistant_message: string
  audit_status: RetencionAuditStatus
  need_db_url: boolean
  questions: string[]
  messages: RetencionChatMessage[]
}

function buildSystemPrompt(
  proyecto: ProyectoContext,
  status: RetencionAuditStatus,
  knowledge: string,
  schemaSummary: string,
  hasDb: boolean
): string {
  const knowledgePreview =
    knowledge.trim().length > 12000
      ? `${knowledge.trim().slice(0, 12000)}\n\n…[truncado; el documento completo está en DB]`
      : knowledge || '(vacío — en el primer turno llama seed_knowledge_from_crm o load_crm_knowledge)'

  return `Eres el AGENTE DE AUDITORÍA de Retención (Buffalo AI).

OBJETIVO:
Construir y GUARDAR el CONTEXTO DEL PROYECTO (documento estructurado). Es la fuente de verdad revisable por el equipo y la base del agente de informes mensuales.
NO generas el informe mensual aquí.

PROYECTO (resumen CRM)
- id: ${proyecto.id}
- nombre: ${proyecto.name}
- servicio: ${proyecto.service_type}
- status: ${proyecto.status}
- mensualidad: ${proyecto.monthly_fee_eur ?? '—'} €/mes (${proyecto.maint_plan || 'plan n/d'})
- flags: voz=${proyecto.has_voz} chat=${proyecto.has_chat} dash=${proyecto.has_dash}
- cliente: ${proyecto.contact_nombre || '—'} · ${proyecto.contact_empresa || '—'}

ESTADO AUDITORÍA: ${status}
DB CLIENTE: ${hasDb ? 'conectada (SELECT)' : 'no conectada'}

CONTEXTO YA GUARDADO:
${knowledgePreview}

SCHEMA SUMMARY:
${schemaSummary || '(vacío)'}

${buildSkillsPromptBlock()}

PROTOCOLO RÁPIDO (primeros turnos)
1) Si el contexto está vacío o es pobre: seed_knowledge_from_crm (o load_crm_knowledge as_markdown=true y luego save/merge).
2) Resume qué ya sabes del CRM y entra en skill **roi_baseline**: tiempo perdido, dinero y recursos del proceso manual → luego calcula ROI/ahorro vs mensualidad Buffalo.
3) Completa operativa (SLAs, flujos) y, si hace falta, Postgres → [[CONNECT_POSTGRES]].
4) Fusiona con merge_knowledge_section; no pierdas secciones 11–12.
5) Español, claro, sin inventar cifras (marca estimado vs hecho).

Si necesitas Postgres, incluye EXACTAMENTE [[CONNECT_POSTGRES]].
Preguntas abiertas al final:
<!--QUESTIONS:${JSON.stringify(['pregunta1', 'pregunta2'])}-->`
}

async function executeTool(
  proyectoId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (name === 'load_crm_knowledge') {
    return toolLoadCrmKnowledge(proyectoId, {
      source: args.source ? String(args.source) : 'all',
      as_markdown: args.as_markdown === true,
    })
  }
  if (name === 'seed_knowledge_from_crm') {
    return toolSeedKnowledgeFromCrm(proyectoId, {
      overwrite: args.overwrite === true,
      mark_ready: args.mark_ready === true,
    })
  }
  if (name === 'merge_knowledge_section') {
    return toolMergeKnowledgeSection(proyectoId, {
      section_id: args.section_id ? String(args.section_id) : undefined,
      content: args.content ? String(args.content) : undefined,
      mark_ready: args.mark_ready === true,
    })
  }
  if (name === 'update_audit_checklist') {
    return toolUpdateAuditChecklist(proyectoId, args)
  }

  if (name === 'save_knowledge') {
    const knowledge = String(args.knowledge || '')
    const schema_summary = args.schema_summary ? String(args.schema_summary) : undefined
    const mark_ready =
      args.mark_ready === true ||
      knowledge.length >= 400 ||
      (schema_summary != null && schema_summary.length >= 120)
    await updateAgentConfig(proyectoId, {
      audit_knowledge: knowledge,
      schema_summary,
      audit_status: mark_ready ? 'ready' : 'schema_audit',
    })
    return { ok: true, audit_status: mark_ready ? 'ready' : 'schema_audit' }
  }

  const url = await getDecryptedDbUrl(proyectoId)
  if (!url) return { error: 'No hay URL de Postgres configurada. Pide [[CONNECT_POSTGRES]].' }

  if (name === 'list_tables') return listPublicTables(url)
  if (name === 'describe_table') {
    return describeTable(url, String(args.schema || 'public'), String(args.table || ''))
  }
  if (name === 'run_select') {
    return runReadOnlySelect(url, String(args.sql || ''), {
      limit: args.limit ? Number(args.limit) : 80,
    })
  }
  return { error: `Tool desconocida: ${name}` }
}

function extractQuestions(text: string): { clean: string; questions: string[] } {
  const m = text.match(/<!--QUESTIONS:(\[[\s\S]*?\])-->/)
  if (!m) return { clean: text.trim(), questions: [] }
  let questions: string[] = []
  try {
    const parsed = JSON.parse(m[1])
    if (Array.isArray(parsed)) questions = parsed.map(String).filter(Boolean)
  } catch {
    // ignore
  }
  return { clean: text.replace(m[0], '').trim(), questions }
}

export async function runRetentionAgentTurn(input: {
  proyectoId: string
  proyecto: ProyectoContext
  userMessage: string
  history: RetencionChatMessage[]
  auditStatus: RetencionAuditStatus
  knowledge: string
  schemaSummary: string
  hasDb: boolean
}): Promise<AgentTurnResult> {
  let status = input.auditStatus
  if (status === 'pending') status = 'discovery'
  if (input.hasDb && (status === 'db_needed' || status === 'discovery')) {
    status = 'schema_audit'
  }

  const system = buildSystemPrompt(
    input.proyecto,
    status,
    input.knowledge,
    input.schemaSummary,
    input.hasDb
  )

  const messages: ChatMsg[] = [{ role: 'system', content: system }]
  for (const m of input.history.slice(-24)) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content })
    }
  }
  messages.push({ role: 'user', content: input.userMessage })

  let model = MODEL
  let assistantText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result: Awaited<ReturnType<typeof chatWithTools>>
    try {
      // Siempre permitir tools: CRM knowledge + (si hay) Postgres
      result = await chatWithTools(messages, model, 'auto')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (model !== FALLBACK && (msg.includes('404') || msg.includes('model'))) {
        model = FALLBACK
        result = await chatWithTools(messages, model, 'auto')
      } else {
        throw err
      }
    }

    if (result.tool_calls?.length) {
      messages.push({ role: 'assistant', content: null, tool_calls: result.tool_calls })
      for (const call of result.tool_calls) {
        const args = parseArgs(call.function.arguments)
        const out = await executeTool(input.proyectoId, call.function.name, args)
        const readyNames = new Set([
          'save_knowledge',
          'seed_knowledge_from_crm',
          'merge_knowledge_section',
        ])
        if (readyNames.has(call.function.name) && (out as { audit_status?: string })?.audit_status === 'ready') {
          status = 'ready'
        } else if (
          (call.function.name === 'list_tables' ||
            call.function.name === 'describe_table' ||
            call.function.name === 'run_select') &&
          status !== 'ready'
        ) {
          status = 'schema_audit'
        } else if (
          (call.function.name === 'load_crm_knowledge' ||
            call.function.name === 'seed_knowledge_from_crm') &&
          (status === 'discovery' || status === 'db_needed')
        ) {
          // keep discovery unless already exploring schema
          if (status === 'db_needed') status = 'discovery'
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(out).slice(0, 24000),
        })
      }
      continue
    }

    assistantText = (result.content || '').trim()
    break
  }

  if (!assistantText) {
    assistantText =
      'He actualizado el contexto. ¿Seguimos con la auditoría o quieres que revise alguna tabla concreta?'
  }

  const needDb =
    !input.hasDb &&
    (/\[\[CONNECT_POSTGRES\]\]/i.test(assistantText) ||
      /NECESITO_DB_URL/i.test(assistantText) ||
      /\b(base de datos|postgres|connection string|url (de )?(la )?bd|conect(a|ar) (la )?bd)\b/i.test(
        assistantText
      ))

  if (needDb) status = 'db_needed'

  const { clean, questions } = extractQuestions(
    assistantText
      .replace(/\[\[CONNECT_POSTGRES\]\]/gi, '')
      .replace(/NECESITO_DB_URL/gi, '')
      .trim()
  )

  const now = new Date().toISOString()
  const nextMessages: RetencionChatMessage[] = [
    ...input.history,
    { role: 'user', content: input.userMessage, at: now },
    { role: 'assistant', content: clean, at: now },
  ]

  await updateAgentConfig(input.proyectoId, {
    audit_status: status,
    audit_messages: nextMessages.slice(-40),
  })

  return {
    assistant_message: clean,
    audit_status: status,
    need_db_url: needDb || status === 'db_needed',
    questions,
    messages: nextMessages,
  }
}

export async function generateMonthlyReport(input: {
  proyectoId: string
  proyecto: ProyectoContext
  knowledge: string
  schemaSummary: string
  reportPrompt: string
  year: number
  month: number
  hasDb: boolean
  previousReport?: { year: number; month: number; content: string } | null
}): Promise<{ title: string; content: string; meta: Record<string, unknown> }> {
  // === Pipeline de MÉTRICAS REALES (Postgres del cliente) ===
  let realMetricsBlock = ''
  let metricsHadData = false
  let metricsMeta: Record<string, unknown> | null = null
  let dataSnapshot: unknown = null

  if (input.hasDb) {
    try {
      const url = await getDecryptedDbUrl(input.proyectoId)
      if (url) {
        // Paso A: definiciones (cacheadas o recién descubiertas)
        let defs = await getMetricQueries(input.proyectoId)
        if (!defs || defs.length === 0) {
          const disc = await discoverMetrics({
            url,
            productType: input.proyecto.service_type,
            knowledgeHint: input.knowledge,
          })
          defs = disc.defs
          if (defs.length) await saveMetricQueries(input.proyectoId, defs)
        }

        if (defs && defs.length) {
          // Paso B: ejecuta periodo actual + anterior
          const periods = derivePeriods(input.year, input.month)
          const results = await runMetrics(url, defs, periods)
          metricsHadData = hasRealData(results)
          const masked = maskDbUrl(url)
          // Paso C: bloque de texto REAL_METRICS
          realMetricsBlock = formatMetrics({
            results,
            year: input.year,
            month: input.month,
            host: masked.host,
            db: masked.database,
          })
          metricsMeta = {
            count: results.length,
            with_data: results.filter((r) => r.status === 'ok' && r.value != null).length,
            metrics: results.map((r) => ({
              id: r.def.id,
              label: r.def.label,
              value: r.value,
              prev: r.prev,
              delta: r.delta,
              delta_pct: r.delta_pct,
              unit: r.def.unit,
              status: r.status,
            })),
          }
        }
        // Lista ligera de tablas para contexto (sin muestreo pesado)
        try {
          const tables = await listPublicTables(url)
          dataSnapshot = { tables: tables.slice(0, 40).map((t) => `${t.schema}.${t.table}`) }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      dataSnapshot = {
        error: e instanceof Error ? e.message : 'No se pudo leer la DB',
      }
    }
  }

  const prompt = (input.reportPrompt || DEFAULT_RETENCION_REPORT_PROMPT).trim()
  const periodLabel = `${input.month.toString().padStart(2, '0')}/${input.year}`
  const prevBlock = input.previousReport
    ? `═══ INFORME ANTERIOR (${String(input.previousReport.month).padStart(2, '0')}/${input.previousReport.year}) — compara deltas ═══
${input.previousReport.content.slice(0, 12000)}

Incluye en el informe un apartado "## 9. Comparativa vs mes anterior" con qué mejoró, empeoró o se mantiene (sin inventar cifras).`
    : `═══ INFORME ANTERIOR ═══
(sin informe previo — omite comparativa o indica «primer informe»)`

  const metricsSection = realMetricsBlock
    ? `\n${realMetricsBlock}\n\nOBLIGATORIO: crea una tarjeta KPI (:::kpi) por cada métrica con datos de REAL_METRICS y coméntala en prosa. Si REAL_METRICS trae números, TIENES PROHIBIDO escribir «sin datos» o «no se registraron interacciones».\n`
    : `\n═══ REAL_METRICS ═══\n(no hay BD conectada o no se pudieron calcular métricas; usa el contexto y marca «Pendiente» donde falte)\n`

  const userContent = `Genera el INFORME MENSUAL de retención con el máximo valor de negocio posible (siguiendo tu system prompt).

Periodo: ${periodLabel}
Proyecto CRM: ${JSON.stringify(input.proyecto)}
${metricsSection}
═══ CONTEXTO DE AUDITORÍA (fuente de verdad; incluye baseline/ROI si existen) ═══
${input.knowledge || '(vacío)'}

═══ SCHEMA SUMMARY ═══
${input.schemaSummary || '(vacío)'}

═══ TABLAS DISPONIBLES (BD cliente) ═══
${JSON.stringify(dataSnapshot).slice(0, 8000)}

${prevBlock}

Devuelve SOLO JSON válido:
{
  "title": "Informe retención ${periodLabel} · nombre corto del cliente/proyecto",
  "content": "markdown completo del informe con las secciones ## del system prompt",
  "highlights": ["3-6 hallazgos de valor"],
  "risks": ["0-5 riesgos concretos"],
  "actions": ["3-7 acciones del plan"],
  "roi_snapshot": {
    "ahorro_mes_eur": null,
    "horas_ahorradas_mes": null,
    "roi_anual_pct": null,
    "payback_meses": null,
    "notes": "sin dato | o breve"
  }
}`

  const callModel = async (model: string): Promise<string> => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: openRouterHeaders(),
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 10000,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: userContent },
        ],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content || ''
  }

  const raw = await (async () => {
    try {
      return await callModel(MODEL)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // Solo cae al modelo de respaldo ante error del modelo bueno
      if (MODEL !== FALLBACK && (msg.includes('404') || msg.includes('model') || msg.includes('429'))) {
        return await callModel(FALLBACK)
      }
      throw err
    }
  })()

  let parsed: Record<string, unknown>
  try {
    parsed = parseJsonFromModelOutput(raw) as Record<string, unknown>
  } catch {
    parsed = {
      title: `Informe retención ${periodLabel} · ${input.proyecto.name}`,
      content: raw,
      highlights: [],
      risks: [],
      actions: [],
    }
  }

  return {
    title: String(parsed.title || `Informe ${periodLabel}`),
    content: String(parsed.content || raw),
    meta: {
      highlights: parsed.highlights || [],
      risks: parsed.risks || [],
      actions: parsed.actions || [],
      roi_snapshot: parsed.roi_snapshot || null,
      period: { year: input.year, month: input.month },
      generated_at: new Date().toISOString(),
      real_metrics: metricsMeta,
      metrics_had_data: metricsHadData,
    },
  }
}
