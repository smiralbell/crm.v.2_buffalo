import { prisma } from '@/lib/prisma'

export const CRM_ACTIVITY_KINDS = [
  'note',
  'call',
  'meeting',
  'document',
  'onboarding',
  'status',
  'origin',
  'system',
] as const

export type CrmActivityKind = (typeof CRM_ACTIVITY_KINDS)[number]

export type CrmActivityRow = {
  id: string
  contact_id: number
  lead_id: number | null
  kind: CrmActivityKind | string
  title: string
  body: string | null
  meta: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
  source: 'stored'
}

type DbRow = {
  id: bigint | number | string
  contact_id: number
  lead_id: number | null
  kind: string
  title: string
  body: string | null
  meta: unknown
  created_by: string | null
  created_at: Date
  updated_at: Date
}

function serialize(row: DbRow): CrmActivityRow {
  let meta: Record<string, unknown> | null = null
  if (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) {
    meta = row.meta as Record<string, unknown>
  }
  return {
    id: String(row.id),
    contact_id: row.contact_id,
    lead_id: row.lead_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    meta,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    source: 'stored',
  }
}

export async function listActivities(opts: {
  contactId?: number
  leadId?: number
  limit?: number
}): Promise<CrmActivityRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 80, 1), 200)
  try {
    // Preferimos historial del contacto (hilo completo). Si solo hay lead, filtramos por lead.
    if (opts.contactId && opts.contactId > 0) {
      const rows = await prisma.$queryRaw<DbRow[]>`
        SELECT id, contact_id, lead_id, kind, title, body, meta, created_by, created_at, updated_at
        FROM crm_activities
        WHERE contact_id = ${opts.contactId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
      return rows.map(serialize)
    }
    if (opts.leadId && opts.leadId > 0) {
      const rows = await prisma.$queryRaw<DbRow[]>`
        SELECT id, contact_id, lead_id, kind, title, body, meta, created_by, created_at, updated_at
        FROM crm_activities
        WHERE lead_id = ${opts.leadId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
      return rows.map(serialize)
    }
  } catch {
    // tabla puede no existir aún
  }
  return []
}

export async function createActivity(input: {
  contactId: number
  leadId?: number | null
  kind: CrmActivityKind | string
  title: string
  body?: string | null
  meta?: Record<string, unknown> | null
  createdBy?: string | null
}): Promise<CrmActivityRow | null> {
  const title = input.title.trim()
  if (!title || !input.contactId) return null
  const kind = (input.kind || 'note').trim() || 'note'
  const body = input.body?.trim() || null
  const metaJson = input.meta ? JSON.stringify(input.meta) : null

  try {
    const rows = await prisma.$queryRawUnsafe<DbRow[]>(
      `INSERT INTO crm_activities (contact_id, lead_id, kind, title, body, meta, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, contact_id, lead_id, kind, title, body, meta, created_by, created_at, updated_at`,
      input.contactId,
      input.leadId ?? null,
      kind,
      title,
      body,
      metaJson,
      input.createdBy ?? null
    )
    return rows[0] ? serialize(rows[0]) : null
  } catch (e) {
    console.error('[crm_activities] create', e)
    return null
  }
}

/** Log best-effort (no lanza). Resuelve contact_id desde lead si hace falta. */
export async function logCrmActivity(input: {
  contactId?: number | null
  leadId?: number | null
  kind: CrmActivityKind | string
  title: string
  body?: string | null
  meta?: Record<string, unknown> | null
  createdBy?: string | null
}): Promise<void> {
  try {
    let contactId = input.contactId ?? null
    const leadId = input.leadId ?? null
    if ((!contactId || contactId <= 0) && leadId && leadId > 0) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { contact_id: true },
      })
      contactId = lead?.contact_id ?? null
    }
    if (!contactId || contactId <= 0) return
    await createActivity({
      contactId,
      leadId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      meta: input.meta,
      createdBy: input.createdBy,
    })
  } catch {
    /* ignore */
  }
}

export async function deleteActivity(id: string | number): Promise<boolean> {
  try {
    const n = BigInt(id)
    await prisma.$executeRaw`DELETE FROM crm_activities WHERE id = ${n}`
    return true
  } catch {
    return false
  }
}
