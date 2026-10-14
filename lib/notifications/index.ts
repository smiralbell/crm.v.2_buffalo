/**
 * Centro de notificaciones. Los módulos publican avisos con `notify()` y este servicio
 * decide a quién y por dónde: siempre a la campana del CRM y, si es urgente y la persona
 * lo tiene activado, también por WhatsApp (vía cola, con reintentos).
 */
import { query } from '@/lib/db'
import type { CrmRole } from '@/lib/auth'
import { enqueueJob } from '@/lib/jobs/queue'

export type NotificationSeverity = 'info' | 'warning' | 'urgent'

export type NotificationRow = {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  severity: NotificationSeverity
  created_at: Date
  read_at: Date | null
}

export type NotifyInput = {
  to: { roles?: CrmRole[]; userIds?: number[] }
  kind: string
  title: string
  body?: string | null
  link?: string | null
  severity?: NotificationSeverity
  /** Evita repetir el mismo aviso (p. ej. `banco-caduca:2026-10-14`). */
  dedupeKey?: string
}

type Recipient = { id: number; whatsapp_phone: string | null; notify_whatsapp: boolean }

function adminEnvRecipient(): Recipient | null {
  if (!process.env.CRM_ADMIN_EMAIL?.trim()) return null
  const phone = process.env.CRM_ADMIN_WHATSAPP?.trim() || null
  return { id: 0, whatsapp_phone: phone, notify_whatsapp: Boolean(phone) }
}

async function resolveRecipients(to: NotifyInput['to']): Promise<Recipient[]> {
  const roles = to.roles ?? []
  const ids = (to.userIds ?? []).filter((n) => Number.isFinite(n) && n > 0)
  const out = new Map<number, Recipient>()
  if (roles.length || ids.length) {
    const { rows } = await query<Recipient>(
      `SELECT id, whatsapp_phone, COALESCE(notify_whatsapp, FALSE) AS notify_whatsapp
         FROM crm_users
        WHERE active = TRUE AND (role = ANY($1::text[]) OR id = ANY($2::int[]))`,
      [roles, ids]
    )
    for (const r of rows) out.set(r.id, r)
  }
  if (roles.includes('admin') || (to.userIds ?? []).includes(0)) {
    const admin = adminEnvRecipient()
    if (admin) out.set(0, admin)
  }
  return Array.from(out.values())
}

/** Publica un aviso. Nunca lanza: un aviso que falla no debe romper el flujo que lo origina. */
export async function notify(input: NotifyInput): Promise<number> {
  try {
    const recipients = await resolveRecipients(input.to)
    const severity = input.severity ?? 'info'
    let created = 0
    for (const r of recipients) {
      const { rows } = await query<{ id: string }>(
        `INSERT INTO notifications (user_id, kind, title, body, link, severity, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
         RETURNING id::text`,
        [r.id, input.kind, input.title, input.body ?? null, input.link ?? null, severity, input.dedupeKey ?? null]
      )
      if (!rows[0]) continue
      created++
      if (severity === 'urgent' && r.notify_whatsapp && r.whatsapp_phone) {
        await enqueueJob(
          'notify.whatsapp',
          { phone: r.whatsapp_phone, text: whatsappText(input) },
          { dedupeKey: `notif-wa:${rows[0].id}` }
        ).catch(() => undefined)
      }
    }
    return created
  } catch (e) {
    console.warn('[notify]', input.kind, e instanceof Error ? e.message : e)
    return 0
  }
}

function whatsappText(input: NotifyInput): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || ''
  const link = input.link ? (input.link.startsWith('http') ? input.link : `${base}${input.link}`) : ''
  return [`🔔 *${input.title}*`, input.body || '', link].filter(Boolean).join('\n')
}

export async function listNotifications(userId: number, limit = 30): Promise<NotificationRow[]> {
  const { rows } = await query<NotificationRow>(
    `SELECT id::text, kind, title, body, link, severity, created_at, read_at
       FROM notifications WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 100)]
  )
  return rows
}

export async function unreadCount(userId: number): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  )
  return Number(rows[0]?.n ?? 0)
}

export async function markNotificationsRead(userId: number, ids?: string[]): Promise<number> {
  const res = ids?.length
    ? await query(
        `UPDATE notifications SET read_at = NOW()
          WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::bigint[])`,
        [userId, ids]
      )
    : await query(`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`, [userId])
  return res.rowCount
}

/** Borra avisos leídos de más de 90 días. */
export async function pruneNotifications(): Promise<number> {
  const { rowCount } = await query(
    `DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < NOW() - INTERVAL '90 days'`
  )
  return rowCount
}
