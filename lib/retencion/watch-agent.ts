import { openRouterChatCompletion } from '@/lib/openrouter'
import { getDecryptedDbUrl, getOrCreateAgentConfig } from '@/lib/retencion/agent-config-store'
import { listIncidentsSince } from '@/lib/retencion/incidents'
import { collectWatchDbDelta, saveWatchMemory } from '@/lib/retencion/watch-db-memory'
import {
  DEFAULT_WATCH_PROMPT,
  ensureWatchColumns,
  getWatchPublic,
  listDueWatchProjects,
  listWatchRuns,
  saveWatchRun,
  type WatchGraph,
  type WatchNodeId,
  type WatchPack,
} from '@/lib/retencion/watch-store'
import { query } from '@/lib/db'

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…[truncado]` : s
}

function excerpt(s: string | null, max = 400): string {
  if (!s) return ''
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function buildCleanPack(input: {
  connected: boolean
  lastDeltaAt: string | null
  deltas: Awaited<ReturnType<typeof collectWatchDbDelta>>['deltas']
  incidents: Awaited<ReturnType<typeof listIncidentsSince>>
  runs: Awaited<ReturnType<typeof listWatchRuns>>
}): WatchPack {
  return {
    generated_at: new Date().toISOString(),
    db: {
      connected: input.connected,
      last_delta_at: input.lastDeltaAt,
      tables: input.deltas.map((d) => ({
        name: `${d.schema}.${d.table}`,
        new_rows: d.new_rows,
        truncated: d.truncated,
        note: d.note,
        sample: d.sample,
      })),
    },
    incidents: input.incidents.map((x) => ({
      id: x.id,
      error: x.error_text,
      occurrences: x.occurrences,
      last_seen_at: new Date(x.last_seen_at).toISOString(),
      status: x.status,
    })),
    previous_reports: input.runs.map((r) => ({
      at: r.created_at,
      ok: r.ok,
      excerpt: excerpt(r.report || r.error, 500),
    })),
  }
}

export async function runWatchForProject(proyectoId: string): Promise<{
  ok: boolean
  report: string
  graph: WatchGraph
  error?: string
}> {
  const used: WatchNodeId[] = ['cron']
  await ensureWatchColumns()
  const cfgRow = await getOrCreateAgentConfig(proyectoId)
  const watch = await getWatchPublic(proyectoId)
  const { rows: proj } = await query<{ name: string }>(
    `SELECT name FROM proyectos WHERE id = $1::uuid LIMIT 1`,
    [proyectoId]
  )
  const name = proj[0]?.name || proyectoId
  const watchPrompt = watch.watch_prompt?.trim() || cfgRow.report_prompt?.trim() || DEFAULT_WATCH_PROMPT

  let deltas: Awaited<ReturnType<typeof collectWatchDbDelta>>['deltas'] = []
  let pendingMemory: Awaited<ReturnType<typeof collectWatchDbDelta>>['nextMemory'] | null = null
  const dbUrl = await getDecryptedDbUrl(proyectoId)

  if (dbUrl) {
    try {
      const collected = await collectWatchDbDelta(proyectoId, dbUrl, {
        tables: watch.excluded_tables,
        columns: watch.excluded_columns,
      })
      pendingMemory = collected.nextMemory
      deltas = collected.deltas
      used.push('db')
    } catch (e) {
      deltas = [
        {
          schema: 'public',
          table: '_error',
          cursor: null,
          new_rows: 0,
          truncated: false,
          sample: [],
          note: `No se pudo leer el delta: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]
    }
  }

  const incidents = await listIncidentsSince(proyectoId, watch.last_at, 40)
  used.push('incidents')

  const previousRuns = await listWatchRuns(proyectoId, 5)
  used.push('reports')

  const pack = buildCleanPack({
    connected: Boolean(dbUrl),
    lastDeltaAt: pendingMemory?.last_delta_at || watch.db_last_delta_at,
    deltas,
    incidents,
    runs: previousRuns,
  })
  used.push('clean')

  const dbNewRows = deltas.reduce((acc, d) => acc + (d.new_rows || 0), 0)
  const graph: WatchGraph = {
    used: [],
    at: new Date().toISOString(),
    db_new_rows: dbNewRows,
    incidents_new: incidents.length,
  }

  let report = ''
  try {
    const packed = clip(JSON.stringify(pack, null, 2), 24000)
    report = (
      await openRouterChatCompletion(
        [
          { role: 'system', content: watchPrompt },
          {
            role: 'user',
            content: [
              `Proyecto: ${name}`,
              `id: ${proyectoId}`,
              'Paquete limpio del flujo (solo datos nuevos + últimos informes):',
              packed,
              'Entrega el informe en markdown.',
            ].join('\n\n'),
          },
        ],
        { temperature: 0.2, maxTokens: 2800 }
      )
    ).trim()
    used.push('ai')
    graph.used = used
    if (pendingMemory) {
      await saveWatchMemory(proyectoId, {
        ...pendingMemory,
        summary: clip(report, 18000),
        last_delta_at: pendingMemory.last_delta_at || new Date().toISOString(),
      })
    }
    await saveWatchRun({ proyectoId, ok: true, report, graph, pack })
    return { ok: true, report, graph }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    graph.used = used
    await saveWatchRun({
      proyectoId,
      ok: false,
      report: report || null,
      graph,
      error,
      pack,
    })
    return { ok: false, report: report || error, graph, error }
  }
}

export async function runDueWatches(): Promise<{ ran: number; ok: number; failed: number }> {
  const ids = await listDueWatchProjects()
  let ok = 0
  let failed = 0
  for (let i = 0; i < ids.length; i++) {
    const r = await runWatchForProject(ids[i])
    if (r.ok) ok += 1
    else failed += 1
  }
  return { ran: ids.length, ok, failed }
}
