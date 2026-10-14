/**
 * Ingesta unificada de eventos entrantes (webhooks).
 *
 *  webhook → verifica firma → recordInboundEvent (guarda crudo, idempotente)
 *          → processInboundEvent (en el momento) → si falla, el worker lo reintenta
 *
 * Añadir una fuente nueva = escribir su procesador en lib/ingest/processors.ts.
 */
import { createHash } from 'crypto'
import { query } from '@/lib/db'
import { INBOUND_PROCESSORS, type InboundProcessorResult } from '@/lib/ingest/processors'

export type InboundStatus = 'pending' | 'processing' | 'processed' | 'ignored' | 'failed'

export type InboundEventRow = {
  id: string
  source: string
  external_id: string
  event_type: string | null
  status: InboundStatus
  attempts: number
  last_error: string | null
  result: unknown
  received_at: Date
  processed_at: Date | null
  next_attempt_at: Date
}

const MAX_ATTEMPTS = 8

export function hashBody(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function isMissingTable(e: unknown): boolean {
  return Boolean(e && typeof e === 'object' && (e as { code?: string }).code === '42P01')
}

/**
 * Guarda el evento. Devuelve `null` si la tabla aún no existe (migraciones sin aplicar):
 * en ese caso el webhook procesa directamente, como antes.
 */
export async function recordInboundEvent(input: {
  source: string
  externalId: string
  eventType?: string | null
  payload: unknown
}): Promise<{ id: string; duplicate: boolean; status: InboundStatus } | null> {
  try {
    const inserted = await query<{ id: string; status: InboundStatus }>(
      `INSERT INTO inbound_events (source, external_id, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id::text, status`,
      [input.source, input.externalId, input.eventType ?? null, JSON.stringify(input.payload ?? null)]
    )
    if (inserted.rows[0]) return { ...inserted.rows[0], duplicate: false }
    const existing = await query<{ id: string; status: InboundStatus }>(
      `SELECT id::text, status FROM inbound_events WHERE source = $1 AND external_id = $2`,
      [input.source, input.externalId]
    )
    const row = existing.rows[0]
    return row ? { ...row, duplicate: true } : null
  } catch (e) {
    if (isMissingTable(e)) return null
    throw e
  }
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(6 * 3600, 60 * 2 ** Math.max(0, attempts - 1)) // 1, 2, 4… min, máx. 6 h
}

/**
 * Procesa un evento si está pendiente/fallido (o atascado en «processing» > 10 min).
 * Seguro ante llamadas concurrentes: solo uno lo reclama.
 */
export async function processInboundEvent(
  id: string
): Promise<{ status: InboundStatus; result?: InboundProcessorResult['result']; error?: string } | null> {
  const claimed = await query<{ source: string; payload: unknown; attempts: number }>(
    `UPDATE inbound_events
        SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1
        AND (status IN ('pending', 'failed')
             OR (status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'))
      RETURNING source, payload, attempts`,
    [id]
  )
  const ev = claimed.rows[0]
  if (!ev) return null

  const processor = INBOUND_PROCESSORS[ev.source]
  try {
    if (!processor) throw new Error(`No hay procesador para la fuente «${ev.source}»`)
    const out = await processor(ev.payload)
    await query(
      `UPDATE inbound_events
          SET status = $2, result = $3::jsonb, last_error = NULL,
              processed_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [id, out.status, JSON.stringify(out.result ?? null)]
    )
    return { status: out.status, result: out.result }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await query(
      `UPDATE inbound_events
          SET status = 'failed', last_error = LEFT($2, 2000), updated_at = NOW(),
              next_attempt_at = NOW() + make_interval(secs => $3::double precision)
        WHERE id = $1`,
      [id, message, retryDelaySeconds(ev.attempts)]
    )
    console.error(`[ingest] ${ev.source} #${id} falló (intento ${ev.attempts}):`, message)
    return { status: 'failed', error: message }
  }
}

/** Reintenta los eventos vencidos. Deja 1 min de margen a los recién llegados (los procesa su webhook). */
export async function retryDueInboundEvents(limit = 25): Promise<{ processed: number; failed: number }> {
  const { rows } = await query<{ id: string }>(
    `SELECT id::text FROM inbound_events
      WHERE ((status IN ('pending', 'failed') AND next_attempt_at <= NOW())
             OR (status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'))
        AND attempts < $1
        AND received_at < NOW() - INTERVAL '1 minute'
      ORDER BY next_attempt_at
      LIMIT $2`,
    [MAX_ATTEMPTS, limit]
  )
  let processed = 0
  let failed = 0
  for (const { id } of rows) {
    const r = await processInboundEvent(id)
    if (r?.status === 'failed') failed++
    else if (r) processed++
  }
  return { processed, failed }
}

/** Reprocesar a mano desde la pantalla de salud (aunque ya estuviera procesado o agotado). */
export async function reprocessInboundEvent(id: string) {
  await query(
    `UPDATE inbound_events SET status = 'pending', attempts = 0, next_attempt_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [id]
  )
  return processInboundEvent(id)
}

export async function listInboundEvents(opts: {
  status?: string
  source?: string
  limit?: number
}): Promise<InboundEventRow[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.status) {
    params.push(opts.status)
    where.push(`status = $${params.length}`)
  }
  if (opts.source) {
    params.push(opts.source)
    where.push(`source = $${params.length}`)
  }
  params.push(Math.min(Math.max(opts.limit ?? 50, 1), 200))
  const { rows } = await query<InboundEventRow>(
    `SELECT id::text, source, external_id, event_type, status, attempts, last_error, result,
            received_at, processed_at, next_attempt_at
       FROM inbound_events
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY received_at DESC
      LIMIT $${params.length}`,
    params
  )
  return rows
}

export async function inboundEventStats(): Promise<
  Array<{ source: string; last24h: number; failed: number; pending: number; last_received_at: Date | null }>
> {
  const { rows } = await query<{
    source: string
    last24h: string
    failed: string
    pending: string
    last_received_at: Date | null
  }>(
    `SELECT source,
            COUNT(*) FILTER (WHERE received_at >= NOW() - INTERVAL '24 hours') AS last24h,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) AS pending,
            MAX(received_at) AS last_received_at
       FROM inbound_events
      GROUP BY source
      ORDER BY source`
  )
  return rows.map((r) => ({
    source: r.source,
    last24h: Number(r.last24h),
    failed: Number(r.failed),
    pending: Number(r.pending),
    last_received_at: r.last_received_at,
  }))
}

export type AcceptInboundResult = {
  ok: true
  event_id: string | null
  duplicate: boolean
  status: string
  result?: Record<string, unknown>
  error?: string
}

/**
 * Camino común de todos los webhooks: guarda (idempotente) y procesa.
 * `defer`: responde «aceptado» y procesa en segundo plano (Fireflies, Retell).
 */
export async function acceptInbound(input: {
  source: string
  externalId: string
  eventType?: string | null
  payload: unknown
  mode?: 'sync' | 'defer'
}): Promise<AcceptInboundResult> {
  const processor = INBOUND_PROCESSORS[input.source]
  if (!processor) throw new Error(`No hay procesador para la fuente «${input.source}»`)

  const recorded = await recordInboundEvent({
    source: input.source,
    externalId: input.externalId,
    eventType: input.eventType,
    payload: input.payload,
  })

  if (!recorded) {
    const out = await processor(input.payload)
    return { ok: true, event_id: null, duplicate: false, status: out.status, result: out.result }
  }
  if (recorded.duplicate && recorded.status !== 'failed') {
    return { ok: true, event_id: recorded.id, duplicate: true, status: recorded.status }
  }
  if (input.mode === 'defer') {
    void processInboundEvent(recorded.id)
    return { ok: true, event_id: recorded.id, duplicate: false, status: 'accepted' }
  }
  const out = await processInboundEvent(recorded.id)
  return {
    ok: true,
    event_id: recorded.id,
    duplicate: false,
    status: out?.status ?? recorded.status,
    result: out?.result,
    error: out?.error,
  }
}
