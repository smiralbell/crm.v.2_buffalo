import { isSmtpConfigured, sendMail } from '@/lib/mail/smtp'

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function adminEmails(): string[] {
  const listed = envList('ADMIN_ALERT_EMAILS')
  if (listed.length) return listed
  const fallback = (process.env.CRM_ADMIN_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim()
  return fallback ? [fallback] : []
}

function telegramChatIds(): string[] {
  return envList('TELEGRAM_CHAT_IDS').length
    ? envList('TELEGRAM_CHAT_IDS')
    : envList('TELEGRAM_CHAT_ID')
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
      console.warn('[incident-alerts] telegram', e)
    }
  }
}

export async function alertIncident(input: {
  proyectoId: string
  proyectoName: string
  error: string
  incidentId: string
}): Promise<void> {
  const title = `Incidencia: ${input.proyectoName}`
  const body = input.error.slice(0, 500)
  const link = `/retencion/proyectos/${input.proyectoId}?tab=incidencias`
  try {
    if (isSmtpConfigured()) {
      const to = adminEmails()
      if (to.length) {
        await sendMail({
          to,
          subject: `[CRM] ${title}`,
          text: `${body}\n\n${link}`,
          html: `<p>${body.replace(/</g, '&lt;')}</p><p><a href="${link}">${link}</a></p>`,
        })
      }
    }
  } catch (e) {
    console.warn('[incident-alerts] email', e)
  }
  try {
    await sendTelegram(`<b>${title.replace(/</g, '')}</b>\n${body.replace(/</g, '')}\n${link}`)
  } catch (e) {
    console.warn('[incident-alerts] telegram', e)
  }
}
