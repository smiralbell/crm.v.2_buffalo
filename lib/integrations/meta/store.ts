import { prisma } from '@/lib/prisma'
import { nextMetaEventAction } from '@/lib/integrations/meta/parse'
import type { MetaLeadgenChange, ParsedMetaLead } from '@/lib/integrations/meta/parse'

export type MetaLeadEventStatus = 'pending' | 'processed' | 'failed' | 'ignored'

export type MetaLeadEventRow = {
  id: number
  leadgen_id: string
  page_id: string | null
  page_name: string | null
  platform: string | null
  form_id: string | null
  form_name: string | null
  ad_id: string | null
  ad_name: string | null
  adset_id: string | null
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  is_organic: boolean | null
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
  page_name: string | null
  platform: string | null
  form_id: string | null
  form_name: string | null
  ad_id: string | null
  ad_name: string | null
  adset_id: string | null
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  is_organic: boolean | null
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

const RETURNING = `id, leadgen_id, page_id, page_name, platform, form_id, form_name, ad_id, ad_name,
  adset_id, adset_name, campaign_id, campaign_name, is_organic, payload, graph_payload, status,
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
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS page_name TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS platform TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS form_name TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS ad_name TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS adset_id TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS adset_name TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS campaign_id TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS campaign_name TEXT`
  )
  await prisma.$executeRawUnsafe(
    `ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS is_organic BOOLEAN`
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meta_lead_events_retry ON meta_lead_events (status, next_retry_at)`
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meta_lead_events_lead ON meta_lead_events (lead_id)`
  )
  schemaEnsured = true
}

function mapRow(r: DbRow): MetaLeadEventRow {
  return {
    ...r,
    status: (r.status as MetaLeadEventStatus) || 'pending',
    attempts: Number(r.attempts) || 0,
    is_organic: r.is_organic == null ? null : Boolean(r.is_organic),
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
    `INSERT INTO meta_lead_events (leadgen_id, page_id, form_id, ad_id, adset_id, payload, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending')
     ON CONFLICT (leadgen_id) DO NOTHING
     RETURNING ${RETURNING}`,
    change.leadgen_id,
    change.page_id || null,
    change.form_id,
    change.ad_id,
    change.adgroup_id,
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
    attribution?: ParsedMetaLead | null
  }
): Promise<void> {
  await ensureMetaLeadEventsTable()
  const graph = patch.graph_payload !== undefined ? JSON.stringify(patch.graph_payload) : null
  const a = patch.attribution
  await prisma.$executeRawUnsafe(
    `UPDATE meta_lead_events SET
       attempts = attempts + CASE WHEN $2 THEN 1 ELSE 0 END,
       status = $3,
       last_error = $4,
       contact_id = COALESCE($5, contact_id),
       lead_id = COALESCE($6, lead_id),
       graph_payload = COALESCE($7::jsonb, graph_payload),
       page_id = COALESCE($8, page_id),
       page_name = COALESCE($9, page_name),
       platform = COALESCE($10, platform),
       form_id = COALESCE($11, form_id),
       form_name = COALESCE($12, form_name),
       ad_id = COALESCE($13, ad_id),
       ad_name = COALESCE($14, ad_name),
       adset_id = COALESCE($15, adset_id),
       adset_name = COALESCE($16, adset_name),
       campaign_id = COALESCE($17, campaign_id),
       campaign_name = COALESCE($18, campaign_name),
       is_organic = COALESCE($19, is_organic),
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
    graph,
    a?.page_id ?? null,
    a?.page_name ?? null,
    a?.platform ?? null,
    a?.form_id ?? null,
    a?.form_name ?? null,
    a?.ad_id ?? null,
    a?.ad_name ?? null,
    a?.adset_id ?? null,
    a?.adset_name ?? null,
    a?.campaign_id ?? null,
    a?.campaign_name ?? null,
    a?.is_organic ?? null
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
     RETURNING i.id, i.leadgen_id, i.page_id, i.page_name, i.platform, i.form_id, i.form_name,
               i.ad_id, i.ad_name, i.adset_id, i.adset_name, i.campaign_id, i.campaign_name,
               i.is_organic, i.payload, i.graph_payload, i.status, i.attempts, i.last_error,
               i.contact_id, i.lead_id, i.next_retry_at, i.created_at, i.processed_at`,
    cap
  )
  return rows.map(mapRow)
}

export async function getMetaAttributionByLeadId(leadId: number): Promise<MetaLeadEventRow | null> {
  await ensureMetaLeadEventsTable()
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT ${RETURNING}
       FROM meta_lead_events
      WHERE lead_id = $1
      ORDER BY processed_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    leadId
  )
  return rows[0] ? mapRow(rows[0]) : null
}
