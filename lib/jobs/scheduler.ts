/**
 * Tareas programadas con bloqueo en Postgres (tabla system_jobs).
 * Da igual cuántos procesos las lancen (web, worker, varias réplicas): cada tarea
 * corre como mucho una vez a la vez y respetando su intervalo, y queda historial
 * (última ejecución, duración, error, fallos seguidos) para la pantalla de salud.
 */
import { query } from '@/lib/db'

export type ScheduledJob = {
  name: string
  /** Texto para la pantalla de salud. */
  label: string
  /** Cada cuánto como mínimo. */
  everyMs: number
  /** Cuánto tiempo se reserva el bloqueo (si el proceso muere, se libera solo al vencer). */
  leaseMs?: number
  /** false → no se ejecuta (p. ej. integración sin configurar). */
  enabled?: () => boolean
  /** Devuelve un resumen corto para el historial. */
  run: () => Promise<string | void>
}

export type JobRunOutcome = 'ran' | 'failed' | 'not_due' | 'locked' | 'disabled'

export type SystemJobRow = {
  name: string
  last_started_at: Date | null
  last_finished_at: Date | null
  last_status: string | null
  last_message: string | null
  last_duration_ms: number | null
  runs: number
  failures: number
  consecutive_failures: number
  locked_by: string | null
  locked_until: Date | null
}

type FailureHook = (job: ScheduledJob, message: string, consecutive: number) => Promise<void> | void
let failureHook: FailureHook | null = null

/** Se llama cuando una tarea falla (para avisar al equipo). */
export function onScheduledJobFailure(hook: FailureHook): void {
  failureHook = hook
}

export function processOwnerId(mode: string): string {
  return `${process.env.HOSTNAME || 'local'}:${process.pid}:${mode}`
}

async function claim(job: ScheduledJob, owner: string, force: boolean): Promise<boolean> {
  await query(`INSERT INTO system_jobs (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [job.name])
  const lease = job.leaseMs ?? Math.max(5 * 60_000, Math.min(job.everyMs, 60 * 60_000))
  const { rows } = await query<{ name: string }>(
    `UPDATE system_jobs
        SET locked_by = $2,
            locked_until = NOW() + make_interval(secs => $3::double precision / 1000),
            last_started_at = NOW(),
            updated_at = NOW()
      WHERE name = $1
        AND (locked_until IS NULL OR locked_until < NOW())
        AND ($5::boolean OR last_started_at IS NULL
             OR last_started_at <= NOW() - make_interval(secs => $4::double precision / 1000))
      RETURNING name`,
    [job.name, owner, lease, job.everyMs, force]
  )
  return rows.length > 0
}

async function finish(job: ScheduledJob, ok: boolean, message: string, durationMs: number) {
  const { rows } = await query<{ consecutive_failures: number }>(
    `UPDATE system_jobs
        SET last_finished_at = NOW(),
            last_status = $2,
            last_message = LEFT($3, 2000),
            last_duration_ms = $4,
            runs = runs + 1,
            failures = failures + CASE WHEN $2 = 'error' THEN 1 ELSE 0 END,
            consecutive_failures = CASE WHEN $2 = 'error' THEN consecutive_failures + 1 ELSE 0 END,
            locked_by = NULL,
            locked_until = NULL,
            updated_at = NOW()
      WHERE name = $1
      RETURNING consecutive_failures`,
    [job.name, ok ? 'ok' : 'error', message, durationMs]
  )
  return rows[0]?.consecutive_failures ?? 0
}

/** Ejecuta la tarea si le toca y nadie más la tiene cogida. `force` ignora el intervalo (no el bloqueo). */
export async function runJobIfDue(
  job: ScheduledJob,
  owner: string,
  opts: { force?: boolean } = {}
): Promise<{ outcome: JobRunOutcome; message?: string }> {
  if (job.enabled && !job.enabled()) return { outcome: 'disabled' }
  if (!(await claim(job, owner, Boolean(opts.force)))) {
    return { outcome: opts.force ? 'locked' : 'not_due' }
  }
  const started = Date.now()
  try {
    const message = (await job.run()) || 'ok'
    await finish(job, true, message, Date.now() - started)
    return { outcome: 'ran', message }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn(`[jobs] ${job.name} falló:`, message)
    const consecutive = await finish(job, false, message, Date.now() - started).catch(() => 0)
    if (failureHook) await Promise.resolve(failureHook(job, message, consecutive)).catch(() => undefined)
    return { outcome: 'failed', message }
  }
}

export async function listSystemJobs(): Promise<SystemJobRow[]> {
  const { rows } = await query<SystemJobRow>(
    `SELECT name, last_started_at, last_finished_at, last_status, last_message, last_duration_ms,
            runs, failures, consecutive_failures, locked_by, locked_until
       FROM system_jobs ORDER BY name`
  )
  return rows
}
