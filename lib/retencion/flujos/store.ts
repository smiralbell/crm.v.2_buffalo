import { query } from '@/lib/db'

/** Intervalos permitidos en minutos. 0 = solo manual. */
export const FLUJO_INTERVALOS = [0, 15, 60, 360, 1440] as const
export type FlujoIntervalo = (typeof FLUJO_INTERVALOS)[number]

export const INTERVALO_LABEL: Record<FlujoIntervalo, string> = {
  0: 'Manual',
  15: 'Cada 15 min',
  60: 'Cada hora',
  360: 'Cada 6 horas',
  1440: 'Diario',
}

export type FlujoRow = {
  id: string
  proyecto_id: string
  name: string
  prompt: string
  interval_minutes: number
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

export type FlujoRunRow = {
  id: string
  flujo_id: string
  trigger: 'manual' | 'cron'
  status: 'running' | 'ok' | 'error'
  output: unknown
  trace: TraceStep[]
  error: string | null
  started_at: string
  finished_at: string | null
}

export type TraceStep = {
  tool: string
  args: unknown
  ok: boolean
  preview: string
}

let ready = false
export async function ensureFlujosTables(): Promise<void> {
  if (ready) return
  await query(`
    CREATE TABLE IF NOT EXISTS retencion_flujos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
  await query(`
    CREATE TABLE IF NOT EXISTS retencion_flujo_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      flujo_id UUID NOT NULL REFERENCES retencion_flujos(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      output JSONB,
      trace JSONB NOT NULL DEFAULT '[]'::jsonb,
      error TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )`)
  ready = true
}

const FLUJO_COLS = `id::text, proyecto_id::text, name, prompt, interval_minutes, enabled,
  last_run_at, next_run_at, created_at, updated_at`

export async function listFlujos(proyectoId: string): Promise<FlujoRow[]> {
  await ensureFlujosTables()
  const { rows } = await query<FlujoRow>(
    `SELECT ${FLUJO_COLS} FROM retencion_flujos WHERE proyecto_id = $1::uuid ORDER BY created_at ASC`,
    [proyectoId]
  )
  return rows
}

export async function getFlujo(proyectoId: string, flujoId: string): Promise<FlujoRow | null> {
  await ensureFlujosTables()
  const { rows } = await query<FlujoRow>(
    `SELECT ${FLUJO_COLS} FROM retencion_flujos WHERE id = $1::uuid AND proyecto_id = $2::uuid`,
    [flujoId, proyectoId]
  )
  return rows[0] ?? null
}

export async function createFlujo(input: {
  proyectoId: string
  name: string
  prompt: string
  intervalMinutes: FlujoIntervalo
  enabled: boolean
}): Promise<FlujoRow> {
  await ensureFlujosTables()
  const { rows } = await query<FlujoRow>(
    `INSERT INTO retencion_flujos (proyecto_id, name, prompt, interval_minutes, enabled, next_run_at)
     VALUES ($1::uuid, $2, $3, $4, $5,
             CASE WHEN $4 > 0 AND $5 THEN NOW() + ($4 || ' minutes')::interval ELSE NULL END)
     RETURNING ${FLUJO_COLS}`,
    [input.proyectoId, input.name, input.prompt, input.intervalMinutes, input.enabled]
  )
  return rows[0]
}

export async function updateFlujo(
  proyectoId: string,
  flujoId: string,
  patch: { name?: string; prompt?: string; intervalMinutes?: FlujoIntervalo; enabled?: boolean }
): Promise<FlujoRow | null> {
  const current = await getFlujo(proyectoId, flujoId)
  if (!current) return null
  const name = patch.name ?? current.name
  const prompt = patch.prompt ?? current.prompt
  const interval = patch.intervalMinutes ?? current.interval_minutes
  const enabled = patch.enabled ?? current.enabled
  const { rows } = await query<FlujoRow>(
    `UPDATE retencion_flujos
        SET name = $3, prompt = $4, interval_minutes = $5, enabled = $6, updated_at = NOW(),
            next_run_at = CASE WHEN $5 > 0 AND $6 THEN NOW() + ($5 || ' minutes')::interval ELSE NULL END
      WHERE id = $1::uuid AND proyecto_id = $2::uuid
      RETURNING ${FLUJO_COLS}`,
    [flujoId, proyectoId, name, prompt, interval, enabled]
  )
  return rows[0] ?? null
}

export async function deleteFlujo(proyectoId: string, flujoId: string): Promise<boolean> {
  await ensureFlujosTables()
  const res = await query(`DELETE FROM retencion_flujos WHERE id = $1::uuid AND proyecto_id = $2::uuid`, [
    flujoId,
    proyectoId,
  ])
  return (res.rowCount ?? 0) > 0
}

export async function listRuns(flujoId: string, limit = 20): Promise<FlujoRunRow[]> {
  await ensureFlujosTables()
  const { rows } = await query<FlujoRunRow>(
    `SELECT id::text, flujo_id::text, trigger, status, output, trace, error, started_at, finished_at
       FROM retencion_flujo_runs WHERE flujo_id = $1::uuid
      ORDER BY started_at DESC LIMIT $2`,
    [flujoId, limit]
  )
  return rows
}

export async function startRun(flujoId: string, trigger: 'manual' | 'cron'): Promise<string> {
  await ensureFlujosTables()
  const { rows } = await query<{ id: string }>(
    `INSERT INTO retencion_flujo_runs (flujo_id, trigger, status) VALUES ($1::uuid, $2, 'running') RETURNING id::text`,
    [flujoId, trigger]
  )
  return rows[0].id
}

export async function finishRun(input: {
  runId: string
  flujoId: string
  status: 'ok' | 'error'
  output: unknown
  trace: TraceStep[]
  error: string | null
  intervalMinutes: number
}): Promise<void> {
  await query(
    `UPDATE retencion_flujo_runs
        SET status = $2, output = $3::jsonb, trace = $4::jsonb, error = $5, finished_at = NOW()
      WHERE id = $1::uuid`,
    [input.runId, input.status, JSON.stringify(input.output ?? null), JSON.stringify(input.trace), input.error]
  )
  await query(
    `UPDATE retencion_flujos
        SET last_run_at = NOW(),
            next_run_at = CASE WHEN interval_minutes > 0 AND enabled
                               THEN NOW() + (interval_minutes || ' minutes')::interval ELSE NULL END
      WHERE id = $1::uuid`,
    [input.flujoId]
  )
}

/** Flujos con disparador de tiempo que toca ejecutar ahora. */
export async function dueFlujos(limit = 5): Promise<FlujoRow[]> {
  await ensureFlujosTables()
  const { rows } = await query<FlujoRow>(
    `SELECT ${FLUJO_COLS} FROM retencion_flujos
      WHERE enabled AND interval_minutes > 0 AND (next_run_at IS NULL OR next_run_at <= NOW())
      ORDER BY next_run_at NULLS FIRST LIMIT $1`,
    [limit]
  )
  return rows
}
