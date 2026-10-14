import { query } from '@/lib/db'
import {
  getOrCreateAgentConfig,
  toPublicConfig,
  updateAgentConfig,
  type RetencionAgentConfigRow,
} from '@/lib/retencion/agent-config-store'

export const DEFAULT_WATCH_PROMPT = `Eres el agente de vigilancia de un sistema de un cliente Buffalo.
Tienes herramientas de solo lectura: query_db (PostgreSQL del cliente), get_knowledge (knowledge del proyecto), get_agent_prompt (prompt de los agentes de producción) y list_open_incidents.
Revisa lo último que ha pasado y escribe un informe claro en markdown: estado general, anomalías, riesgos y si hace falta actuar.
No inventes tablas ni datos. Si falta la URL de la base de datos, dilo.`

export const WATCH_INTERVALS = [
  { minutes: 0, label: 'Pausado' },
  { minutes: 15, label: 'Cada 15 minutos' },
  { minutes: 30, label: 'Cada 30 minutos' },
  { minutes: 60, label: 'Cada hora' },
  { minutes: 180, label: 'Cada 3 horas' },
  { minutes: 360, label: 'Cada 6 horas' },
  { minutes: 1440, label: 'Cada día' },
] as const

export type WatchNodeId = 'agent' | 'db' | 'knowledge' | 'prompt' | 'incidents'

export type WatchGraph = {
  used: WatchNodeId[]
  at: string
}

export type WatchPublic = {
  every_minutes: number | null
  last_at: string | null
  last_report: string | null
  last_graph: WatchGraph | null
  watch_prompt: string
  agent_prompt: string
  knowledge: string
  db_connected: boolean
  db_host: string | null
  db_name: string | null
}

type WatchCols = {
  watch_every_minutes: number | null
  watch_last_at: Date | null
  watch_last_report: string | null
  watch_last_graph: WatchGraph | null
  watch_prompt: string | null
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
      ADD COLUMN IF NOT EXISTS watch_prompt TEXT
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
  watchColsEnsured = true
}

function parseGraph(raw: unknown): WatchGraph | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const used = Array.isArray(o.used)
    ? o.used.filter((x): x is WatchNodeId =>
        x === 'agent' || x === 'db' || x === 'knowledge' || x === 'prompt' || x === 'incidents'
      )
    : []
  return { used, at: typeof o.at === 'string' ? o.at : new Date().toISOString() }
}

async function selectWatchCols(proyectoId: string): Promise<WatchCols> {
  await ensureWatchColumns()
  const { rows } = await query<WatchCols>(
    `SELECT watch_every_minutes, watch_last_at, watch_last_report, watch_last_graph, watch_prompt
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
  }
}

export function toWatchPublic(row: RetencionAgentConfigRow, watch: WatchCols): WatchPublic {
  const cfg = toPublicConfig(row)
  return {
    every_minutes: watch.watch_every_minutes,
    last_at: watch.watch_last_at ? new Date(watch.watch_last_at).toISOString() : null,
    last_report: watch.watch_last_report,
    last_graph: watch.watch_last_graph,
    watch_prompt: watch.watch_prompt?.trim() || DEFAULT_WATCH_PROMPT,
    agent_prompt: row.report_prompt?.trim() || '',
    knowledge: cfg.audit_knowledge,
    db_connected: cfg.db_connected,
    db_host: cfg.db_host,
    db_name: cfg.db_name,
  }
}

export async function getWatchPublic(proyectoId: string): Promise<WatchPublic> {
  const row = await getOrCreateAgentConfig(proyectoId)
  const watch = await selectWatchCols(proyectoId)
  return toWatchPublic(row, watch)
}

export async function saveWatchSettings(
  proyectoId: string,
  patch: {
    every_minutes?: number | null
    watch_prompt?: string
    knowledge?: string
    agent_prompt?: string
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
    const mins = patch.every_minutes == null || patch.every_minutes <= 0 ? null : patch.every_minutes
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
  return getWatchPublic(proyectoId)
}

export async function saveWatchRun(input: {
  proyectoId: string
  ok: boolean
  report?: string | null
  graph?: WatchGraph | null
  error?: string | null
}): Promise<void> {
  await ensureWatchColumns()
  await query(
    `INSERT INTO retencion_watch_runs (proyecto_id, ok, report, graph, error)
     VALUES ($1::uuid, $2, $3, $4::jsonb, $5)`,
    [
      input.proyectoId,
      input.ok,
      input.report ?? null,
      JSON.stringify(input.graph ?? null),
      input.error ?? null,
    ]
  )
  await query(
    `UPDATE retencion_agent_configs SET
       watch_last_at = NOW(),
       watch_last_report = $2,
       watch_last_graph = $3::jsonb,
       updated_at = NOW()
     WHERE proyecto_id = $1::uuid`,
    [input.proyectoId, input.report ?? null, JSON.stringify(input.graph ?? null)]
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
