import { query } from '@/lib/db'
import {
  loadWatchMemory,
  type SchemaTable,
} from '@/lib/retencion/watch-db-memory'
import { DEFAULT_WATCH_MODEL, resolveWatchModel } from '@/lib/retencion/watch-models'
import {
  getOrCreateAgentConfig,
  toPublicConfig,
  updateAgentConfig,
  type RetencionAgentConfigRow,
} from '@/lib/retencion/agent-config-store'

export const DEFAULT_WATCH_PROMPT = `Eres un analista de sistemas de Buffalo. Recibes un paquete ya limpio y estructurado:
(1) filas NUEVAS de la base del cliente desde la última pasada,
(2) incidencias nuevas desde el último cron,
(3) extractos de los últimos informes de este mismo flujo.

No inventes tablas ni datos. No pidas el histórico completo. Escribe un informe en markdown: qué ha cambiado, anomalías, riesgos y si hace falta actuar. Sé concreto y breve.`

export { formatWatchInterval, WATCH_MAX_MINUTES } from '@/lib/retencion/watch-interval'

export type WatchNodeId = 'cron' | 'db' | 'incidents' | 'reports' | 'clean' | 'ai'

export const WATCH_NODE_IDS: WatchNodeId[] = ['cron', 'db', 'incidents', 'reports', 'clean', 'ai']

export type WatchGraph = {
  used: WatchNodeId[]
  at: string
  db_new_rows?: number
  incidents_new?: number
}

export type WatchRunTrigger = 'manual' | 'cron'

export type WatchRunPublic = {
  id: string
  ok: boolean
  created_at: string
  started_at: string
  finished_at: string | null
  trigger: WatchRunTrigger
  report: string | null
  error: string | null
  graph: WatchGraph | null
  running: boolean
}

export type WatchPack = {
  generated_at: string
  db: {
    connected: boolean
    last_delta_at: string | null
    tables: {
      name: string
      new_rows: number
      truncated: boolean
      note?: string
      sample: Record<string, unknown>[]
    }[]
  }
  incidents: {
    id: string
    error: string
    occurrences: number
    last_seen_at: string
    status: string
  }[]
  previous_reports: { at: string; ok: boolean; excerpt: string }[]
}

export type WatchPublic = {
  every_minutes: number | null
  last_at: string | null
  last_report: string | null
  last_graph: WatchGraph | null
  last_pack: WatchPack | null
  watch_prompt: string
  watch_model: string
  agent_prompt: string
  knowledge: string
  db_connected: boolean
  db_host: string | null
  db_name: string | null
  db_summary: string | null
  db_last_delta_at: string | null
  schema: SchemaTable[]
  excluded_tables: string[]
  excluded_columns: string[]
  runs: WatchRunPublic[]
  live_used: WatchNodeId[]
  live_running: boolean
  next_run_at: string | null
}

const liveByProject = new Map<string, { used: WatchNodeId[]; running: boolean }>()

export function setWatchLiveProgress(proyectoId: string, used: WatchNodeId[], running: boolean) {
  liveByProject.set(proyectoId, { used: used.slice(), running })
}

export function getWatchLiveProgress(proyectoId: string): { used: WatchNodeId[]; running: boolean } {
  return liveByProject.get(proyectoId) || { used: [], running: false }
}

type WatchCols = {
  watch_every_minutes: number | null
  watch_last_at: Date | null
  watch_last_report: string | null
  watch_last_graph: WatchGraph | null
  watch_prompt: string | null
  watch_model: string | null
  watch_last_pack: WatchPack | null
  excluded_tables: string[]
  excluded_columns: string[]
}

let watchColsEnsured = false

export async function ensureWatchColumns(): Promise<void> {
  if (watchColsEnsured) return
  await query(`
    ALTER TABLE retencion_agent_configs
      ADD COLUMN IF NOT EXISTS watch_every_minutes INT,
      ADD COLUMN IF NOT EXISTS watch_last_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS watch_last_report TEXT,
      ADD COLUMN IF NOT EXISTS watch_last_graph JSONB,
      ADD COLUMN IF NOT EXISTS watch_prompt TEXT,
      ADD COLUMN IF NOT EXISTS watch_model TEXT,
      ADD COLUMN IF NOT EXISTS watch_excluded_tables JSONB,
      ADD COLUMN IF NOT EXISTS watch_excluded_columns JSONB,
      ADD COLUMN IF NOT EXISTS watch_last_pack JSONB
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS retencion_watch_runs (
      id           BIGSERIAL PRIMARY KEY,
      proyecto_id  UUID NOT NULL,
      ok           BOOLEAN NOT NULL DEFAULT TRUE,
      report       TEXT,
      graph        JSONB,
      error        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    ALTER TABLE retencion_watch_runs
      ADD COLUMN IF NOT EXISTS run_trigger TEXT,
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS retencion_watch_runs_proyecto
      ON retencion_watch_runs (proyecto_id, created_at DESC)
  `)
  watchColsEnsured = true
}

function asStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (let i = 0; i < raw.length; i++) {
    if (typeof raw[i] === 'string' && raw[i]) out.push(raw[i] as string)
  }
  return out
}

function isWatchNode(x: unknown): x is WatchNodeId {
  return (
    x === 'cron' ||
    x === 'db' ||
    x === 'incidents' ||
    x === 'reports' ||
    x === 'clean' ||
    x === 'ai'
  )
}

function parseGraph(raw: unknown): WatchGraph | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const used: WatchNodeId[] = []
  if (Array.isArray(o.used)) {
    for (let i = 0; i < o.used.length; i++) {
      const x = o.used[i]
      if (isWatchNode(x)) used.push(x)
      else if (x === 'agent' || x === 'prompt') used.push('ai')
    }
  }
  return {
    used,
    at: typeof o.at === 'string' ? o.at : new Date().toISOString(),
    db_new_rows: typeof o.db_new_rows === 'number' ? o.db_new_rows : undefined,
    incidents_new: typeof o.incidents_new === 'number' ? o.incidents_new : undefined,
  }
}

function parsePack(raw: unknown): WatchPack | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as WatchPack
  if (typeof o.generated_at !== 'string' || !o.db || !Array.isArray(o.incidents)) return null
  return o
}

async function selectWatchCols(proyectoId: string): Promise<WatchCols> {
  await ensureWatchColumns()
  const { rows } = await query<{
    watch_every_minutes: number | null
    watch_last_at: Date | null
    watch_last_report: string | null
    watch_last_graph: unknown
    watch_prompt: string | null
    watch_model: string | null
    watch_last_pack: unknown
    watch_excluded_tables: unknown
    watch_excluded_columns: unknown
  }>(
    `SELECT watch_every_minutes, watch_last_at, watch_last_report, watch_last_graph, watch_prompt,
            watch_model, watch_last_pack, watch_excluded_tables, watch_excluded_columns
       FROM retencion_agent_configs
      WHERE proyecto_id = $1::uuid
      LIMIT 1`,
    [proyectoId]
  )
  const row = rows[0]
  return {
    watch_every_minutes: row?.watch_every_minutes ?? null,
    watch_last_at: row?.watch_last_at ?? null,
    watch_last_report: row?.watch_last_report ?? null,
    watch_last_graph: parseGraph(row?.watch_last_graph),
    watch_prompt: row?.watch_prompt ?? null,
    watch_model: row?.watch_model ?? null,
    watch_last_pack: parsePack(row?.watch_last_pack),
    excluded_tables: asStringList(row?.watch_excluded_tables),
    excluded_columns: asStringList(row?.watch_excluded_columns),
  }
}

function asTrigger(raw: unknown): WatchRunTrigger {
  return raw === 'cron' ? 'cron' : 'manual'
}

export function nextWatchRunAt(everyMinutes: number | null, lastAt: Date | string | null): string | null {
  if (!everyMinutes || everyMinutes <= 0) return null
  const lastMs = lastAt ? new Date(lastAt).getTime() : 0
  const due = lastMs ? lastMs + everyMinutes * 60_000 : Date.now()
  return new Date(Math.max(due, Date.now())).toISOString()
}

export async function listWatchRuns(proyectoId: string, limit = 5): Promise<WatchRunPublic[]> {
  await ensureWatchColumns()
  const { rows } = await query<{
    id: string
    ok: boolean
    report: string | null
    error: string | null
    graph: unknown
    created_at: Date
    run_trigger: string | null
    started_at: Date | null
    finished_at: Date | null
  }>(
    `SELECT id::text, ok, report, error, graph, created_at,
            run_trigger, started_at, finished_at
       FROM retencion_watch_runs
      WHERE proyecto_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2`,
    [proyectoId, Math.min(200, Math.max(1, limit))]
  )
  return rows.map((r) => {
    const started = new Date(r.started_at || r.created_at).toISOString()
    const finished = r.finished_at ? new Date(r.finished_at).toISOString() : null
    return {
      id: r.id,
      ok: r.ok,
      report: r.report,
      error: r.error,
      graph: parseGraph(r.graph),
      created_at: new Date(r.created_at).toISOString(),
      started_at: started,
      finished_at: finished,
      trigger: asTrigger(r.run_trigger),
      running: !finished && r.ok && !r.report && !r.error,
    }
  })
}

export async function startWatchRun(proyectoId: string, trigger: WatchRunTrigger): Promise<string> {
  await ensureWatchColumns()
  await query(
    `UPDATE retencion_watch_runs
        SET ok = false, error = COALESCE(error, 'Interrumpida'), finished_at = NOW()
      WHERE proyecto_id = $1::uuid AND finished_at IS NULL`,
    [proyectoId]
  )
  const { rows } = await query<{ id: string }>(
    `INSERT INTO retencion_watch_runs (proyecto_id, ok, run_trigger, started_at)
     VALUES ($1::uuid, true, $2, NOW())
     RETURNING id::text`,
    [proyectoId, trigger]
  )
  return rows[0]?.id || ''
}

export function toWatchPublic(
  row: RetencionAgentConfigRow,
  watch: WatchCols,
  extra: {
    summary?: string
    last_delta_at?: string | null
    schema?: SchemaTable[]
    runs?: WatchRunPublic[]
  }
): WatchPublic {
  const cfg = toPublicConfig(row)
  return {
    every_minutes: watch.watch_every_minutes,
    last_at: watch.watch_last_at ? new Date(watch.watch_last_at).toISOString() : null,
    last_report: watch.watch_last_report,
    last_graph: watch.watch_last_graph,
    last_pack: watch.watch_last_pack,
    watch_prompt: watch.watch_prompt?.trim() || DEFAULT_WATCH_PROMPT,
    watch_model: resolveWatchModel(watch.watch_model || DEFAULT_WATCH_MODEL),
    agent_prompt: row.report_prompt?.trim() || '',
    knowledge: cfg.audit_knowledge,
    db_connected: cfg.db_connected,
    db_host: cfg.db_host,
    db_name: cfg.db_name,
    db_summary: extra.summary || null,
    db_last_delta_at: extra.last_delta_at || null,
    schema: extra.schema || [],
    excluded_tables: watch.excluded_tables,
    excluded_columns: watch.excluded_columns,
    runs: extra.runs || [],
    live_used: getWatchLiveProgress(row.proyecto_id).used,
    live_running: getWatchLiveProgress(row.proyecto_id).running,
    next_run_at: nextWatchRunAt(watch.watch_every_minutes, watch.watch_last_at),
  }
}

export async function getWatchPublic(proyectoId: string): Promise<WatchPublic> {
  const row = await getOrCreateAgentConfig(proyectoId)
  const watch = await selectWatchCols(proyectoId)
  const memory = await loadWatchMemory(proyectoId).catch(() => ({
    summary: '',
    last_delta_at: null,
    watermarks: [],
    schema_snapshot: [] as SchemaTable[],
  }))
  const runs = await listWatchRuns(proyectoId, 80).catch(() => [])
  return toWatchPublic(row, watch, {
    summary: memory.summary,
    last_delta_at: memory.last_delta_at,
    schema: memory.schema_snapshot,
    runs,
  })
}

export async function saveWatchSettings(
  proyectoId: string,
  patch: {
    every_minutes?: number | null
    watch_prompt?: string
    watch_model?: string
    knowledge?: string
    agent_prompt?: string
    excluded_tables?: string[]
    excluded_columns?: string[]
  }
): Promise<WatchPublic> {
  await getOrCreateAgentConfig(proyectoId)
  if (patch.knowledge != null || patch.agent_prompt != null) {
    await updateAgentConfig(proyectoId, {
      ...(patch.knowledge != null ? { audit_knowledge: patch.knowledge } : {}),
      ...(patch.agent_prompt != null ? { report_prompt: patch.agent_prompt } : {}),
    })
  }
  await ensureWatchColumns()
  if (patch.every_minutes !== undefined) {
    const mins =
      patch.every_minutes == null || patch.every_minutes <= 0
        ? null
        : Math.min(86_400, Math.max(1, Math.floor(patch.every_minutes)))
    await query(
      `UPDATE retencion_agent_configs SET watch_every_minutes = $2, updated_at = NOW() WHERE proyecto_id = $1::uuid`,
      [proyectoId, mins]
    )
  }
  if (patch.watch_prompt != null) {
    await query(
      `UPDATE retencion_agent_configs SET watch_prompt = $2, updated_at = NOW() WHERE proyecto_id = $1::uuid`,
      [proyectoId, patch.watch_prompt]
    )
  }
  if (patch.watch_model != null) {
    await query(
      `UPDATE retencion_agent_configs SET watch_model = $2, updated_at = NOW() WHERE proyecto_id = $1::uuid`,
      [proyectoId, resolveWatchModel(patch.watch_model)]
    )
  }
  if (patch.excluded_tables != null) {
    await query(
      `UPDATE retencion_agent_configs SET watch_excluded_tables = $2::jsonb, updated_at = NOW() WHERE proyecto_id = $1::uuid`,
      [proyectoId, JSON.stringify(patch.excluded_tables)]
    )
  }
  if (patch.excluded_columns != null) {
    await query(
      `UPDATE retencion_agent_configs SET watch_excluded_columns = $2::jsonb, updated_at = NOW() WHERE proyecto_id = $1::uuid`,
      [proyectoId, JSON.stringify(patch.excluded_columns)]
    )
  }
  return getWatchPublic(proyectoId)
}

export async function saveWatchRun(input: {
  proyectoId: string
  runId?: string
  ok: boolean
  report?: string | null
  graph?: WatchGraph | null
  error?: string | null
  pack?: WatchPack | null
}): Promise<void> {
  await ensureWatchColumns()
  if (input.runId) {
    await query(
      `UPDATE retencion_watch_runs
          SET ok = $2, report = $3, graph = $4::jsonb, error = $5, finished_at = NOW()
        WHERE id = $1::bigint`,
      [
        input.runId,
        input.ok,
        input.report ?? null,
        JSON.stringify(input.graph ?? null),
        input.error ?? null,
      ]
    )
  } else {
    await query(
      `INSERT INTO retencion_watch_runs (proyecto_id, ok, report, graph, error, run_trigger, started_at, finished_at)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5, 'manual', NOW(), NOW())`,
      [
        input.proyectoId,
        input.ok,
        input.report ?? null,
        JSON.stringify(input.graph ?? null),
        input.error ?? null,
      ]
    )
  }
  await query(
    `UPDATE retencion_agent_configs SET
       watch_last_at = NOW(),
       watch_last_report = $2,
       watch_last_graph = $3::jsonb,
       watch_last_pack = $4::jsonb,
       updated_at = NOW()
     WHERE proyecto_id = $1::uuid`,
    [
      input.proyectoId,
      input.report ?? null,
      JSON.stringify(input.graph ?? null),
      JSON.stringify(input.pack ?? null),
    ]
  )
}

export async function listDueWatchProjects(): Promise<string[]> {
  await ensureWatchColumns()
  const { rows } = await query<{ proyecto_id: string }>(
    `SELECT proyecto_id::text
       FROM retencion_agent_configs
      WHERE watch_every_minutes IS NOT NULL
        AND watch_every_minutes > 0
        AND (
          watch_last_at IS NULL
          OR watch_last_at < NOW() - (watch_every_minutes::text || ' minutes')::interval
        )`
  )
  return rows.map((r) => r.proyecto_id)
}

export function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`
}

export function columnKey(schema: string, table: string, column: string): string {
  return `${schema}.${table}.${column}`
}
