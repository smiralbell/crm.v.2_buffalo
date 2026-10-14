import { prisma } from '@/lib/prisma'
import { nextMetaEventAction } from '@/lib/integrations/meta/parse'
import type { MetaLeadgenChange } from '@/lib/integrations/meta/parse'

export type MetaLeadEventStatus = 'pending' | 'processed' | 'failed' | 'ignored'

export type MetaLeadEventRow = {
  id: number
  leadgen_id: string
  page_id: string | null
  form_id: string | null
  ad_id: string | null
  payload: unknown
  graph_payload: unknown
  status: MetaLeadEventStatus
  attempts: number
  last_error: string | null
  contact_id: number | null
  lead_id: number | null
  next_retry_at: Date | null
  created_at: Date
  processed_at: Date | null
}

type DbRow = {
  id: number
  leadgen_id: string
  page_id: string | null
  form_id: string | null
  ad_id: string | null
  payload: unknown
  graph_payload: unknown
  status: string
  attempts: number
  last_error: string | null
  contact_id: number | null
  lead_id: number | null
  next_retry_at: Date | null
  created_at: Date
  processed_at: Date | null
}

const RETURNING = `id, leadgen_id, page_id, form_id, ad_id, payload, graph_payload, status,
  attempts, last_error, contact_id, lead_id, next_retry_at, created_at, processed_at`

let schemaEnsured = false

export async function ensureMetaLeadEventsTable(): Promise<void> {
  if (schemaEnsured) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_lead_events (
      id             SERIAL PRIMARY KEY,
      leadgen_id     TEXT NOT NULL UNIQUE,
      page_id        TEXT,
      form_id        TEXT,
      ad_id          TEXT,
      payload        JSONB NOT NULL,
      graph_payload  JSONB,
      status         TEXT NOT NULL DEFAULT 'pending',
      attempts       INT NOT NULL DEFAULT 0,
      last_error     TEXT,
      contact_id     INT,
      lead_id        INT,
      next_retry_at  TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at   TIMESTAMPTZ
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meta_lead_events_retry ON meta_lead_events (status, next_retry_at)`
  )
  schemaEnsured = true
}

function mapRow(r: DbRow): MetaLeadEventRow {
  return {
    ...r,
    status: (r.status as MetaLeadEventStatus) || 'pending',
    attempts: Number(r.attempts) || 0,
  }
}

export type PersistMetaEventResult = {
  event: MetaLeadEventRow
  duplicate: boolean
  action: ReturnType<typeof nextMetaEventAction>
}

export async function persistMetaLeadEvent(
  change: MetaLeadgenChange,
  payload: unknown
): Promise<PersistMetaEventResult> {
  await ensureMetaLeadEventsTable()
  const json = JSON.stringify(payload ?? change)
  const inserted = await prisma.$queryRawUnsafe<DbRow[]>(
    `INSERT INTO meta_lead_events (leadgen_id, page_id, form_id, ad_id, payload, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')
     ON CONFLICT (leadgen_id) DO NOTHING
     RETURNING ${RETURNING}`,
    change.leadgen_id,
    change.page_id || null,
    change.form_id,
    change.ad_id,
    json
  )
  if (inserted[0]) {
    return { event: mapRow(inserted[0]), duplicate: false, action: 'insert' }
  }
  const existing = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT ${RETURNING} FROM meta_lead_events WHERE leadgen_id = $1 LIMIT 1`,
    change.leadgen_id
  )
  const event = existing[0] ? mapRow(existing[0]) : null
  if (!event) throw new Error('No se pudo guardar el evento Meta')
  return { event, duplicate: true, action: nextMetaEventAction(event) }
}

export async function markMetaLeadEvent(
  id: number,
  patch: {
    status: MetaLeadEventStatus
    graph_payload?: unknown
    last_error?: string | null
    contact_id?: number | null
    lead_id?: number | null
    bumpAttempt?: boolean
  }
): Promise<void> {
  await ensureMetaLeadEventsTable()
  const graph = patch.graph_payload !== undefined ? JSON.stringify(patch.graph_payload) : null
  await prisma.$executeRawUnsafe(
    `UPDATE meta_lead_events SET
       attempts = attempts + CASE WHEN $2 THEN 1 ELSE 0 END,
       status = $3,
       last_error = $4,
       contact_id = COALESCE($5, contact_id),
       lead_id = COALESCE($6, lead_id),
       graph_payload = COALESCE($7::jsonb, graph_payload),
       processed_at = CASE WHEN $3 IN ('processed', 'ignored') THEN NOW() ELSE processed_at END,
       next_retry_at = CASE
         WHEN $3 = 'failed'
           THEN NOW() + (LEAST(30, POWER(2, attempts + CASE WHEN $2 THEN 1 ELSE 0 END)) * INTERVAL '1 minute')
         ELSE NULL
       END
     WHERE id = $1`,
    id,
    Boolean(patch.bumpAttempt),
    patch.status,
    patch.last_error ?? null,
    patch.contact_id ?? null,
    patch.lead_id ?? null,
    graph
  )
}

export async function claimDueMetaLeadEvents(limit = 25): Promise<MetaLeadEventRow[]> {
  await ensureMetaLeadEventsTable()
  const cap = Math.max(1, Math.min(50, Math.floor(limit)))
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `WITH due AS (
       SELECT id
         FROM meta_lead_events
        WHERE status IN ('pending', 'failed')
          AND attempts < 10
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE meta_lead_events i
        SET next_retry_at = NOW() + INTERVAL '5 minutes'
       FROM due
      WHERE i.id = due.id
     RETURNING i.id, i.leadgen_id, i.page_id, i.form_id, i.ad_id, i.payload, i.graph_payload, i.status,
               i.attempts, i.last_error, i.contact_id, i.lead_id, i.next_retry_at, i.created_at, i.processed_at`,
    cap
  )
  return rows.map(mapRow)
}
