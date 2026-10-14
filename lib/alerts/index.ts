/**
 * Avisos a los administradores: correo SMTP + Telegram.
 * Los módulos publican con `notify()`; esto no pinta campana in-app ni WhatsApp de staff.
 */
import { query } from '@/lib/db'
import { enqueueJob } from '@/lib/jobs/queue'
import { isSmtpConfigured, sendMail } from '@/lib/mail/smtp'
import { isTelegramConfigured, sendTelegramMessage, telegramChatIds } from '@/lib/alerts/telegram'

export type NotificationSeverity = 'info' | 'warning' | 'urgent'

export type NotifyInput = {
  kind: string
  title: string
  body?: string | null
  link?: string | null
  severity?: NotificationSeverity
  /** Evita repetir el mismo aviso (p. ej. `banco-caduca:2026-10-14`). */
  dedupeKey?: string
}

export type ChannelStatus = 'sent' | 'skipped' | 'failed'

export type DeliverResult = {
  email: ChannelStatus
  telegram: ChannelStatus
  error?: string
}

export type AdminAlertRow = {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  severity: string
  email_status: string | null
  telegram_status: string | null
  last_error: string | null
  created_at: Date
}

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function adminAlertEmails(): string[] {
  const listed = envList('ADMIN_ALERT_EMAILS')
  if (listed.length) return listed
  const fallback = (process.env.CRM_ADMIN_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim()
  return fallback ? [fallback] : []
}

export function alertsStatus() {
  const emails = adminAlertEmails()
  const chats = telegramChatIds()
  return {
    smtp: isSmtpConfigured(),
    telegram: isTelegramConfigured(),
    emails,
    telegram_chats: chats.length,
    ready: (isSmtpConfigured() && emails.length > 0) || isTelegramConfigured(),
  }
}

export function crmBaseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

export function absoluteLink(link?: string | null): string {
  if (!link) return ''
  if (link.startsWith('http://') || link.startsWith('https://')) return link
  const base = crmBaseUrl()
  return base ? `${base}${link.startsWith('/') ? link : `/${link}`}` : link
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const SEVERITY_LABEL: Record<NotificationSeverity, string> = {
  info: '',
  warning: 'Aviso · ',
  urgent: 'Urgente · ',
}

export function formatAlertEmail(input: NotifyInput): { subject: string; text: string; html: string } {
  const prefix = SEVERITY_LABEL[input.severity ?? 'info']
  const subject = `[CRM] ${prefix}${input.title}`
  const url = absoluteLink(input.link)
  const text = [input.title, input.body || '', url].filter(Boolean).join('\n\n')
  const html = [
    `<p style="font-family:system-ui,sans-serif;font-size:16px;margin:0 0 8px"><strong>${escapeHtml(input.title)}</strong></p>`,
    input.body
      ? `<p style="font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap;margin:0 0 12px;color:#374151">${escapeHtml(input.body)}</p>`
      : '',
    url ? `<p style="font-family:system-ui,sans-serif;font-size:13px"><a href="${escapeHtml(url)}">Abrir en el CRM</a></p>` : '',
  ].join('')
  return { subject, text, html }
}

export function formatAlertTelegram(input: NotifyInput): string {
  const url = absoluteLink(input.link)
  const lines = [`<b>${escapeHtml(input.title)}</b>`]
  if (input.body) lines.push(escapeHtml(input.body))
  if (url) lines.push(`<a href="${escapeHtml(url)}">Abrir en el CRM</a>`)
  return lines.join('\n')
}

export async function deliverAlert(input: NotifyInput): Promise<DeliverResult> {
  const emails = adminAlertEmails()
  const out: DeliverResult = {
    email: isSmtpConfigured() && emails.length ? 'failed' : 'skipped',
    telegram: isTelegramConfigured() ? 'failed' : 'skipped',
  }
  const errors: string[] = []

  if (out.email !== 'skipped') {
    try {
      const mail = formatAlertEmail(input)
      await sendMail({ to: emails, ...mail })
      out.email = 'sent'
    } catch (e) {
      errors.push(`correo: ${e instanceof Error ? e.message : e}`)
    }
  }

  if (out.telegram !== 'skipped') {
    try {
      await sendTelegramMessage(formatAlertTelegram(input))
      out.telegram = 'sent'
    } catch (e) {
      errors.push(`telegram: ${e instanceof Error ? e.message : e}`)
    }
  }

  if (errors.length) out.error = errors.join(' · ')
  return out
}

async function logAlert(input: NotifyInput): Promise<{ id: string | null; duplicate: boolean }> {
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO admin_alerts (kind, title, body, link, severity, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
       RETURNING id::text`,
      [
        input.kind,
        input.title,
        input.body ?? null,
        input.link ?? null,
        input.severity ?? 'info',
        input.dedupeKey ?? null,
      ]
    )
    return { id: rows[0]?.id ?? null, duplicate: Boolean(input.dedupeKey) && !rows[0] }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('does not exist') || (e as { code?: string }).code === '42P01') {
      return { id: null, duplicate: false }
    }
    throw e
  }
}

async function markAlert(id: string | null, result: DeliverResult) {
  if (!id) return
  try {
    await query(
      `UPDATE admin_alerts
          SET email_status = $2, telegram_status = $3, last_error = $4
        WHERE id = $1`,
      [id, result.email, result.telegram, result.error ?? null]
    )
  } catch {
    /* tabla pendiente */
  }
}

function shouldRetry(result: DeliverResult): boolean {
  return result.email === 'failed' || result.telegram === 'failed'
}

/** Publica un aviso a los admins. Nunca lanza. */
export async function notify(input: NotifyInput): Promise<DeliverResult> {
  const empty: DeliverResult = { email: 'skipped', telegram: 'skipped' }
  try {
    const logged = await logAlert(input)
    if (logged.duplicate) return empty

    const result = await deliverAlert(input)
    await markAlert(logged.id, result)

    if (shouldRetry(result)) {
      await enqueueJob(
        'admin.alert',
        {
          kind: input.kind,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          severity: input.severity ?? 'info',
        },
        { dedupeKey: logged.id ? `admin-alert:${logged.id}` : input.dedupeKey ? `admin-alert:${input.dedupeKey}` : undefined }
      ).catch(() => undefined)
    }
    if (result.error) console.warn('[alerts]', input.kind, result.error)
    return result
  } catch (e) {
    console.warn('[alerts]', input.kind, e instanceof Error ? e.message : e)
    return { email: 'failed', telegram: 'failed', error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deliverQueuedAlert(payload: Record<string, unknown>): Promise<void> {
  const result = await deliverAlert({
    kind: String(payload.kind || 'aviso'),
    title: String(payload.title || 'Aviso CRM'),
    body: payload.body != null ? String(payload.body) : null,
    link: payload.link != null ? String(payload.link) : null,
    severity: payload.severity === 'urgent' || payload.severity === 'warning' ? payload.severity : 'info',
  })
  if (shouldRetry(result)) throw new Error(result.error || 'No se pudo entregar el aviso')
}

export async function sendTestAlert(): Promise<DeliverResult> {
  if (!alertsStatus().ready) {
    return {
      email: 'skipped',
      telegram: 'skipped',
      error: 'Configura SMTP (y ADMIN_ALERT_EMAILS) o TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID',
    }
  }
  return notify({
    kind: 'sistema.prueba',
    title: 'Prueba de avisos Buffalo CRM',
    body: 'Si ves este mensaje, el canal de avisos a administradores funciona.',
    link: '/sistema',
    severity: 'info',
  })
}

export async function listRecentAlerts(limit = 12): Promise<AdminAlertRow[]> {
  try {
    const { rows } = await query<AdminAlertRow>(
      `SELECT id::text, kind, title, body, link, severity, email_status, telegram_status, last_error, created_at
         FROM admin_alerts
        ORDER BY created_at DESC
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 50)]
    )
    return rows
  } catch {
    return []
  }
}

export async function pruneAlerts(): Promise<number> {
  try {
    const { rowCount } = await query(
      `DELETE FROM admin_alerts WHERE created_at < NOW() - INTERVAL '90 days'`
    )
    return rowCount
  } catch {
    return 0
  }
}
