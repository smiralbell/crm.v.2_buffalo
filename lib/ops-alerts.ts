import { isSmtpConfigured, sendMail } from '@/lib/mail/smtp'
import { insertOpsAlertMessage } from '@/lib/ops-alerts-store'
import { isPushConfigured, sendPush } from '@/lib/push'

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

function telegramChatIds(): string[] {
  return envList('TELEGRAM_CHAT_IDS').length ? envList('TELEGRAM_CHAT_IDS') : envList('TELEGRAM_CHAT_ID')
}

export function crmPublicBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '')
  return base || 'https://n8n-crmv2-buffalo.zedf6b.easypanel.host'
}

function absLink(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${crmPublicBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chats = telegramChatIds()
  if (!token || !chats.length) return
  for (const chatId of chats) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      })
    } catch (e) {
      console.warn('[ops-alerts] telegram', e)
    }
  }
}

/** Texto corto para la notificación del móvil: sin las líneas de enlaces. */
function pushBodyFromText(text: string): string {
  return text
    .split('\n')
    .filter((l) => l.trim() && !/https?:\/\//i.test(l))
    .join(' · ')
    .slice(0, 300)
}

/** Gmail (SMTP) + Telegram + push al móvil (PWA). El mismo canal que incidencias. */
export async function sendOpsAlert(input: {
  subject: string
  text: string
  html?: string
  telegramHtml?: string
  /** Ruta del CRM que abre la notificación push al tocarla. */
  url?: string
}): Promise<void> {
  const channels: string[] = []
  if (isSmtpConfigured() && adminAlertEmails().length) channels.push('email')
  if (process.env.TELEGRAM_BOT_TOKEN?.trim() && telegramChatIds().length) channels.push('telegram')
  if (isPushConfigured()) channels.push('push')
  await insertOpsAlertMessage({
    subject: input.subject,
    body: input.text,
    channels: channels.length ? channels : ['email', 'telegram'],
  })

  try {
    if (isSmtpConfigured()) {
      const to = adminAlertEmails()
      if (to.length) {
        await sendMail({
          to,
          subject: input.subject.startsWith('[CRM]') ? input.subject : `[CRM] ${input.subject}`,
          text: input.text,
          html: input.html || `<pre style="font-family:inherit;white-space:pre-wrap">${escHtml(input.text)}</pre>`,
        })
      }
    }
  } catch (e) {
    console.warn('[ops-alerts] email', e)
  }
  try {
    await sendTelegram(input.telegramHtml || escHtml(input.text))
  } catch (e) {
    console.warn('[ops-alerts] telegram', e)
  }
  try {
    await sendPush({
      title: input.subject.replace(/^\[CRM\]\s*/, ''),
      body: pushBodyFromText(input.text),
      url: input.url,
    })
  } catch (e) {
    console.warn('[ops-alerts] push', e)
  }
}

export function opsLink(path: string): string {
  return absLink(path)
}
