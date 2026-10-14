import { openRouterToolTurn, type ORMessage, type ORTool } from '@/lib/openrouter'
import { getDecryptedDbUrl, getOrCreateAgentConfig, toPublicConfig } from '@/lib/retencion/agent-config-store'
import { listOpenIncidentsForWatch } from '@/lib/retencion/incidents'
import { runReadOnlySelect } from '@/lib/retencion/readonly-postgres'
import {
  DEFAULT_WATCH_PROMPT,
  ensureWatchColumns,
  listDueWatchProjects,
  saveWatchRun,
  type WatchGraph,
  type WatchNodeId,
} from '@/lib/retencion/watch-store'
import { query } from '@/lib/db'

const TOOLS: ORTool[] = [
  {
    name: 'query_db',
    description: 'SELECT de solo lectura contra la PostgreSQL del cliente. Una sentencia.',
    parameters: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'SELECT o WITH … SELECT' } },
      required: ['sql'],
    },
  },
  {
    name: 'get_knowledge',
    description: 'Lee la knowledge del proyecto configurada en el CRM.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_agent_prompt',
    description: 'Lee el prompt de los agentes de producción del proyecto.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_open_incidents',
    description: 'Lista incidencias abiertas de este proyecto (las que aún no están solucionadas).',
    parameters: { type: 'object', properties: {} },
  },
]

function toolArg(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      if (p && typeof p === 'object') return p as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

function clip(s: string, max = 6000): string {
  return s.length > max ? `${s.slice(0, max)}\n…[truncado]` : s
}

export async function runWatchForProject(proyectoId: string): Promise<{
  ok: boolean
  report: string
  graph: WatchGraph
  error?: string
}> {
  const used = new Set<WatchNodeId>(['agent'])
  await ensureWatchColumns()
  const cfgRow = await getOrCreateAgentConfig(proyectoId)
  const cfg = toPublicConfig(cfgRow)
  const { rows: watchRows } = await query<{ watch_prompt: string | null }>(
    `SELECT watch_prompt FROM retencion_agent_configs WHERE proyecto_id = $1::uuid LIMIT 1`,
    [proyectoId]
  )
  const watchPrompt = watchRows[0]?.watch_prompt?.trim() || DEFAULT_WATCH_PROMPT
  const dbUrl = await getDecryptedDbUrl(proyectoId)
  const { rows: proj } = await query<{ name: string }>(
    `SELECT name FROM proyectos WHERE id = $1::uuid LIMIT 1`,
    [proyectoId]
  )
  const name = proj[0]?.name || proyectoId

  const messages: ORMessage[] = [
    { role: 'system', content: watchPrompt },
    {
      role: 'user',
      content: [
        `Proyecto: ${name}`,
        `id: ${proyectoId}`,
        `Base de datos: ${dbUrl ? 'conectada (usa query_db)' : 'NO configurada'}`,
        `Knowledge: ${cfg.audit_knowledge?.trim() ? 'hay texto (usa get_knowledge)' : 'vacía'}`,
        `Prompt de agentes: ${cfg.report_prompt?.trim() ? 'hay texto (usa get_agent_prompt)' : 'vacío'}`,
        'Revisa el estado reciente y entrega el informe.',
      ].join('\n'),
    },
  ]

  let report = ''
  try {
    for (let i = 0; i < 6; i++) {
      const turn = await openRouterToolTurn(messages, TOOLS, { temperature: 0.2, maxTokens: 2500 })
      messages.push(turn.assistantMessage)
      if (!turn.toolCalls.length) {
        report = turn.text.trim()
        break
      }
      for (const call of turn.toolCalls) {
        const args = toolArg(call.arguments)
        let content = ''
        try {
          if (call.name === 'query_db') {
            used.add('db')
            if (!dbUrl) content = JSON.stringify({ error: 'No hay URL de base de datos configurada' })
            else {
              const sql = typeof args.sql === 'string' ? args.sql : ''
              const r = await runReadOnlySelect(dbUrl, sql, { limit: 40 })
              content = clip(JSON.stringify({ columns: r.columns, rowCount: r.rowCount, truncated: r.truncated, rows: r.rows }))
            }
          } else if (call.name === 'get_knowledge') {
            used.add('knowledge')
            content = clip(cfg.audit_knowledge || '(knowledge vacía)')
          } else if (call.name === 'get_agent_prompt') {
            used.add('prompt')
            content = clip(cfgRow.report_prompt?.trim() || '(prompt vacío)')
          } else if (call.name === 'list_open_incidents') {
            used.add('incidents')
            const open = await listOpenIncidentsForWatch(proyectoId, 15)
            content = JSON.stringify(
              open.map((x) => ({
                error: x.error_text,
                occurrences: x.occurrences,
                last_seen_at: x.last_seen_at,
              }))
            )
          } else {
            content = JSON.stringify({ error: `Herramienta desconocida: ${call.name}` })
          }
        } catch (e) {
          content = JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content })
      }
    }
    if (!report) {
      const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.content)
      report = (last && last.role === 'assistant' && last.content) || 'El agente no devolvió informe.'
    }
    const graph: WatchGraph = { used: Array.from(used), at: new Date().toISOString() }
    await saveWatchRun({ proyectoId, ok: true, report, graph })
    return { ok: true, report, graph }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    const graph: WatchGraph = { used: Array.from(used), at: new Date().toISOString() }
    await saveWatchRun({ proyectoId, ok: false, report: report || null, graph, error })
    return { ok: false, report: report || error, graph, error }
  }
}

export async function runDueWatches(): Promise<{ ran: number; ok: number; failed: number }> {
  const ids = await listDueWatchProjects()
  let ok = 0
  let failed = 0
  for (const id of ids) {
    const r = await runWatchForProject(id)
    if (r.ok) ok += 1
    else failed += 1
  }
  return { ran: ids.length, ok, failed }
}
