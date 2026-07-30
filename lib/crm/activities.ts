import { prisma } from '@/lib/prisma'

export const CRM_ACTIVITY_KINDS = [
  'note',
  'call',
  'alert',
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
  due_at: string | null
  resolved_at: string | null
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
  due_at?: Date | null
  resolved_at?: Date | null
  created_at: Date
  updated_at: Date
}

const SELECT_COLS = `id, contact_id, lead_id, kind, title, body, meta, created_by,
  due_at, resolved_at, created_at, updated_at`

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
    due_at: row.due_at ? new Date(row.due_at).toISOString() : null,
    resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
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
    if (opts.contactId && opts.contactId > 0) {
      const rows = await prisma.$queryRawUnsafe<DbRow[]>(
        `SELECT ${SELECT_COLS}
         FROM crm_activities
         WHERE contact_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        opts.contactId,
        limit
      )
      return rows.map(serialize)
    }
    if (opts.leadId && opts.leadId > 0) {
      const rows = await prisma.$queryRawUnsafe<DbRow[]>(
        `SELECT ${SELECT_COLS}
         FROM crm_activities
         WHERE lead_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        opts.leadId,
        limit
      )
      return rows.map(serialize)
    }
  } catch {
    // tabla puede no existir aún / columnas nuevas pendientes
  }
  return []
}

/** Alertas abiertas cuya due_at ya llegó (o no tiene due_at). */
export async function listOpenAlerts(opts?: {
  contactId?: number
  leadId?: number
  limit?: number
}): Promise<CrmActivityRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200)
  try {
    if (opts?.contactId && opts.contactId > 0) {
      const rows = await prisma.$queryRawUnsafe<DbRow[]>(
        `SELECT ${SELECT_COLS}
         FROM crm_activities
         WHERE kind = 'alert'
           AND resolved_at IS NULL
           AND contact_id = $1
           AND (due_at IS NULL OR due_at <= NOW())
         ORDER BY COALESCE(due_at, created_at) ASC
         LIMIT $2`,
        opts.contactId,
        limit
      )
      return rows.map(serialize)
    }
    if (opts?.leadId && opts.leadId > 0) {
      const rows = await prisma.$queryRawUnsafe<DbRow[]>(
        `SELECT ${SELECT_COLS}
         FROM crm_activities
         WHERE kind = 'alert'
           AND resolved_at IS NULL
           AND lead_id = $1
           AND (due_at IS NULL OR due_at <= NOW())
         ORDER BY COALESCE(due_at, created_at) ASC
         LIMIT $2`,
        opts.leadId,
        limit
      )
      return rows.map(serialize)
    }
    const rows = await prisma.$queryRawUnsafe<DbRow[]>(
      `SELECT ${SELECT_COLS}
       FROM crm_activities
       WHERE kind = 'alert'
         AND resolved_at IS NULL
         AND (due_at IS NULL OR due_at <= NOW())
       ORDER BY COALESCE(due_at, created_at) ASC
       LIMIT $1`,
      limit
    )
    return rows.map(serialize)
  } catch {
    return []
  }
}

export async function createActivity(input: {
  contactId: number
  leadId?: number | null
  kind: CrmActivityKind | string
  title: string
  body?: string | null
  meta?: Record<string, unknown> | null
  createdBy?: string | null
  dueAt?: string | Date | null
}): Promise<CrmActivityRow | null> {
  const title = input.title.trim()
  if (!title || !input.contactId) return null
  const kind = (input.kind || 'note').trim() || 'note'
  const body = input.body?.trim() || null
  const metaJson = input.meta ? JSON.stringify(input.meta) : null
  const dueAt =
    kind === 'alert'
      ? input.dueAt
        ? new Date(input.dueAt)
        : new Date()
      : input.dueAt
        ? new Date(input.dueAt)
        : null
  if (dueAt && Number.isNaN(dueAt.getTime())) return null

  try {
    const rows = await prisma.$queryRawUnsafe<DbRow[]>(
      `INSERT INTO crm_activities (contact_id, lead_id, kind, title, body, meta, created_by, due_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING ${SELECT_COLS}`,
      input.contactId,
      input.leadId ?? null,
      kind,
      title,
      body,
      metaJson,
      input.createdBy ?? null,
      dueAt
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
  dueAt?: string | Date | null
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
      dueAt: input.dueAt,
    })
  } catch {
    /* ignore */
  }
}

export async function resolveActivity(id: string | number): Promise<CrmActivityRow | null> {
  try {
    const n = BigInt(id)
    const rows = await prisma.$queryRawUnsafe<DbRow[]>(
      `UPDATE crm_activities
       SET resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND resolved_at IS NULL
       RETURNING ${SELECT_COLS}`,
      n
    )
    return rows[0] ? serialize(rows[0]) : null
  } catch (e) {
    console.error('[crm_activities] resolve', e)
    return null
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
