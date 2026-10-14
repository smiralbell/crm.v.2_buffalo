/**
 * Cola de trabajos sobre Postgres (tabla job_queue): encolar, reclamar con
 * FOR UPDATE SKIP LOCKED y reintentar con espera creciente.
 */
import { query } from '@/lib/db'

export type QueuedJob = {
  id: string
  kind: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

type Handler = (payload: Record<string, unknown>, job: QueuedJob) => Promise<void>
const handlers = new Map<string, Handler>()

export function registerQueueHandler(kind: string, handler: Handler): void {
  handlers.set(kind, handler)
}

export async function enqueueJob(
  kind: string,
  payload: Record<string, unknown> = {},
  opts: { dedupeKey?: string; runAfter?: Date; maxAttempts?: number } = {}
): Promise<{ id: string | null; duplicate: boolean }> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO job_queue (kind, payload, dedupe_key, run_after, max_attempts)
     VALUES ($1, $2::jsonb, $3, COALESCE($4, NOW()), $5)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id::text`,
    [kind, JSON.stringify(payload), opts.dedupeKey ?? null, opts.runAfter ?? null, opts.maxAttempts ?? 5]
  )
  return { id: rows[0]?.id ?? null, duplicate: rows.length === 0 }
}

/** Espera antes del siguiente intento: 1, 2, 4, 8… min (máx. 1 h). */
export function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1))
}

/** Procesa hasta `limit` trabajos vencidos. Devuelve cuántos terminaron bien y cuántos fallaron. */
export async function drainQueue(limit = 20): Promise<{ done: number; failed: number }> {
  const { rows } = await query<QueuedJob>(
    `UPDATE job_queue
        SET status = 'running', attempts = attempts + 1,
            locked_until = NOW() + INTERVAL '5 minutes', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM job_queue
         WHERE (status = 'pending' AND run_after <= NOW())
            OR (status = 'running' AND locked_until < NOW())
         ORDER BY run_after
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id::text, kind, payload, attempts, max_attempts`,
    [limit]
  )
  let done = 0
  let failed = 0
  for (const job of rows) {
    const handler = handlers.get(job.kind)
    try {
      if (!handler) throw new Error(`Sin manejador para «${job.kind}»`)
      await handler(job.payload || {}, job)
      await query(
        `UPDATE job_queue SET status = 'done', finished_at = NOW(), locked_until = NULL,
                last_error = NULL, updated_at = NOW() WHERE id = $1`,
        [job.id]
      )
      done++
    } catch (e) {
      failed++
      const message = e instanceof Error ? e.message : String(e)
      const final = job.attempts >= job.max_attempts
      await query(
        `UPDATE job_queue
            SET status = $2, last_error = LEFT($3, 2000), locked_until = NULL,
                run_after = NOW() + make_interval(secs => $4::double precision / 1000),
                finished_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END,
                updated_at = NOW()
          WHERE id = $1`,
        [job.id, final ? 'failed' : 'pending', message, retryDelayMs(job.attempts)]
      )
    }
  }
  return { done, failed }
}

export async function queueStats(): Promise<{ pending: number; running: number; failed: number; doneToday: number }> {
  const { rows } = await query<{ pending: string; running: string; failed: string; done_today: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
       COUNT(*) FILTER (WHERE status = 'running')  AS running,
       COUNT(*) FILTER (WHERE status = 'failed')   AS failed,
       COUNT(*) FILTER (WHERE status = 'done' AND finished_at >= date_trunc('day', NOW())) AS done_today
     FROM job_queue`
  )
  const r = rows[0]
  return {
    pending: Number(r?.pending ?? 0),
    running: Number(r?.running ?? 0),
    failed: Number(r?.failed ?? 0),
    doneToday: Number(r?.done_today ?? 0),
  }
}

/** Limpia trabajos terminados hace más de 30 días. */
export async function pruneQueue(): Promise<number> {
  const { rowCount } = await query(
    `DELETE FROM job_queue WHERE status = 'done' AND finished_at < NOW() - INTERVAL '30 days'`
  )
  return rowCount
}
