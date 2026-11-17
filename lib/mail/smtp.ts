import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

/**
 * Correo saliente del CRM.
 *
 * Perfil «default» (avisos internos, alertas…):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_FROM_NAME
 *
 * Perfil «invoices» (facturas a clientes). Cada variable es opcional y, si no
 * está, se usa la del perfil general:
 *   INVOICES_SMTP_USER, INVOICES_SMTP_PASS   cuenta con la que se entra (p. ej. admin@)
 *   INVOICES_SMTP_FROM                        dirección que ve el cliente (por defecto, INVOICES_SMTP_USER)
 *   INVOICES_SMTP_FROM_NAME                   nombre que ve el cliente (por defecto «Buffalo AI»)
 *   INVOICES_SMTP_HOST, INVOICES_SMTP_PORT, INVOICES_SMTP_SECURE   solo si es otro servidor
 */

export type SmtpProfile = 'default' | 'invoices'

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

function env(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v ? v : undefined
}

export function getSmtpConfig(profile: SmtpProfile = 'default'): SmtpConfig {
  const p = profile === 'invoices' ? 'INVOICES_SMTP_' : null
  const pick = (key: string) => (p ? env(`${p}${key}`) : undefined) ?? env(`SMTP_${key}`)

  const host = pick('HOST')
  // Si las facturas tienen su propia cuenta, su contraseña es la suya (no la general)
  const ownAccount = p ? env(`${p}USER`) : undefined
  const user = ownAccount ?? env('SMTP_USER')
  const pass = ownAccount ? env(`${p}PASS`) : env('SMTP_PASS')
  const from = (p ? env(`${p}FROM`) ?? ownAccount : undefined) ?? env('SMTP_FROM') ?? user
  const port = Number(pick('PORT') || '465')
  const secure = parseBool(pick('SECURE'), port === 465)
  const fromName = (p ? env(`${p}FROM_NAME`) ?? 'Buffalo AI' : undefined) ?? env('SMTP_FROM_NAME') ?? 'Buffalo CRM'

  const label = p ? `${p}USER / SMTP_USER` : 'SMTP_USER'
  if (!host) throw new SmtpConfigError('Falta SMTP_HOST en las variables de entorno')
  if (!user) throw new SmtpConfigError(`Falta ${label} en las variables de entorno`)
  if (!pass) {
    throw new SmtpConfigError(
      ownAccount ? 'Falta INVOICES_SMTP_PASS (la contraseña de la cuenta de facturas)' : 'Falta SMTP_PASS en las variables de entorno'
    )
  }
  if (!from) throw new SmtpConfigError('Falta SMTP_FROM o SMTP_USER en las variables de entorno')
  if (!Number.isFinite(port) || port <= 0) throw new SmtpConfigError('SMTP_PORT no es válido')

  return { host, port, secure, user, pass, from, fromName }
}

export function isSmtpConfigured(profile: SmtpProfile = 'default'): boolean {
  try {
    getSmtpConfig(profile)
    return true
  } catch {
    return false
  }
}

export function getSmtpPublicStatus(profile: SmtpProfile = 'default') {
  try {
    const cfg = getSmtpConfig(profile)
    return {
      configured: true as const,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.user,
      from: cfg.from,
      fromName: cfg.fromName,
    }
  } catch (error) {
    return {
      configured: false as const,
      error: error instanceof Error ? error.message : 'SMTP no configurado',
    }
  }
}

export function createSmtpTransporter(profile: SmtpProfile = 'default') {
  const cfg = getSmtpConfig(profile)
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
  replyTo?: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
  /** Con qué cuenta sale (por defecto, la general del CRM) */
  profile?: SmtpProfile
}

export async function sendMail(input: SendMailInput) {
  const profile = input.profile ?? 'default'
  const cfg = getSmtpConfig(profile)
  const transporter = createSmtpTransporter(profile)
  return transporter.sendMail({
    from: formatFromAddress(cfg),
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  })
}

export async function verifySmtpConnection(profile: SmtpProfile = 'default') {
  const transporter = createSmtpTransporter(profile)
  await transporter.verify()
}
