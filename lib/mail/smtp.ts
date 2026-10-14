import nodemailer from 'nodemailer'

function env(name: string): string {
  return process.env[name]?.trim() || ''
}

export function smtpPort(): number {
  const n = Number(env('SMTP_PORT') || 465)
  return Number.isFinite(n) && n > 0 ? n : 465
}

export function smtpSecure(): boolean {
  const raw = env('SMTP_SECURE').toLowerCase()
  if (raw === 'false' || raw === '0') return false
  if (raw === 'true' || raw === '1') return true
  return smtpPort() === 465
}

export function isSmtpConfigured(): boolean {
  return Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'))
}

export function smtpFrom(): string {
  const name = env('SMTP_FROM_NAME') || 'Buffalo CRM'
  const addr = env('SMTP_FROM') || env('SMTP_USER')
  return `"${name.replace(/"/g, '')}" <${addr}>`
}

export async function sendMail(input: {
  to: string | string[]
  subject: string
  text: string
  html?: string
}): Promise<void> {
  if (!isSmtpConfigured()) throw new Error('SMTP no configurado (SMTP_HOST, SMTP_USER, SMTP_PASS)')
  const to = Array.isArray(input.to) ? input.to.filter(Boolean).join(', ') : input.to
  if (!to) throw new Error('Sin destinatario de correo')
  const transporter = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port: smtpPort(),
    secure: smtpSecure(),
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
  })
  await transporter.sendMail({
    from: smtpFrom(),
    to,
    subject: input.subject,
    text: input.text,
    html: input.html || undefined,
  })
}
