import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  fromName: string
}

export class SmtpConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SmtpConfigError'
  }
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  const from = process.env.SMTP_FROM?.trim() || user
  const port = Number(process.env.SMTP_PORT || '465')
  const secure = parseBool(process.env.SMTP_SECURE, port === 465)

  if (!host) throw new SmtpConfigError('Falta SMTP_HOST en las variables de entorno')
  if (!user) throw new SmtpConfigError('Falta SMTP_USER en las variables de entorno')
  if (!pass) throw new SmtpConfigError('Falta SMTP_PASS en las variables de entorno')
  if (!from) throw new SmtpConfigError('Falta SMTP_FROM o SMTP_USER en las variables de entorno')
  if (!Number.isFinite(port) || port <= 0) {
    throw new SmtpConfigError('SMTP_PORT no es válido')
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    fromName: process.env.SMTP_FROM_NAME?.trim() || 'Buffalo CRM',
  }
}

export function isSmtpConfigured(): boolean {
  try {
    getSmtpConfig()
    return true
  } catch {
    return false
  }
}

export function getSmtpPublicStatus() {
  try {
    const cfg = getSmtpConfig()
    return {
      configured: true,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.user,
      from: cfg.from,
      fromName: cfg.fromName,
    }
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : 'SMTP no configurado',
    }
  }
}

export function createSmtpTransporter() {
  const cfg = getSmtpConfig()
  const options: SMTPTransport.Options = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  }
  return nodemailer.createTransport(options)
}

export function formatFromAddress(cfg: SmtpConfig = getSmtpConfig()): string {
  return `"${cfg.fromName}" <${cfg.from}>`
}

export interface SendMailInput {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  cc?: string | string[]
  bcc?: string | string[]
}

export async function sendMail(input: SendMailInput) {
  const cfg = getSmtpConfig()
  const transporter = createSmtpTransporter()
  return transporter.sendMail({
    from: formatFromAddress(cfg),
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
}

export async function verifySmtpConnection() {
  const transporter = createSmtpTransporter()
  await transporter.verify()
}
