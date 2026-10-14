import { afterEach, describe, expect, it } from 'vitest'
import { adminAlertEmails, absoluteLink, formatAlertEmail, formatAlertTelegram } from '@/lib/alerts'
import { isTelegramConfigured, telegramChatIds } from '@/lib/alerts/telegram'
import { isSmtpConfigured } from '@/lib/mail/smtp'

const keys = [
  'ADMIN_ALERT_EMAILS',
  'CRM_ADMIN_EMAIL',
  'SMTP_FROM',
  'SMTP_USER',
  'SMTP_HOST',
  'SMTP_PASS',
  'APP_BASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_CHAT_IDS',
]

afterEach(() => {
  for (const k of keys) delete process.env[k]
})

describe('destinatarios de avisos', () => {
  it('parte ADMIN_ALERT_EMAILS por coma', () => {
    process.env.ADMIN_ALERT_EMAILS = 'ana@x.com,  luis@y.com'
    expect(adminAlertEmails()).toEqual(['ana@x.com', 'luis@y.com'])
  })

  it('cae a CRM_ADMIN_EMAIL si no hay lista', () => {
    process.env.CRM_ADMIN_EMAIL = 'admin@agenciabuffalo.es'
    expect(adminAlertEmails()).toEqual(['admin@agenciabuffalo.es'])
  })

  it('Telegram reúne varios chat id', () => {
    process.env.TELEGRAM_CHAT_IDS = '-1001, 12345'
    expect(telegramChatIds()).toEqual(['-1001', '12345'])
    process.env.TELEGRAM_BOT_TOKEN = 'tok'
    expect(isTelegramConfigured()).toBe(true)
  })

  it('SMTP hace falta host, usuario y clave', () => {
    process.env.SMTP_HOST = 'mail.agenciabuffalo.es'
    process.env.SMTP_USER = 'avisos@agenciabuffalo.es'
    expect(isSmtpConfigured()).toBe(false)
    process.env.SMTP_PASS = 'x'
    expect(isSmtpConfigured()).toBe(true)
  })
})

describe('formato del aviso', () => {
  it('correo y telegram llevan título, cuerpo y enlace absoluto', () => {
    process.env.APP_BASE_URL = 'https://crm.agenciabuffalo.es'
    const input = {
      kind: 'lead.webform',
      title: 'Formulario web: Ana',
      body: 'agenciabuffalo.es · /contacto',
      link: '/marketing',
      severity: 'info' as const,
    }
    expect(absoluteLink(input.link)).toBe('https://crm.agenciabuffalo.es/marketing')
    const mail = formatAlertEmail(input)
    expect(mail.subject).toBe('[CRM] Formulario web: Ana')
    expect(mail.text).toContain('/marketing')
    const tg = formatAlertTelegram(input)
    expect(tg).toContain('<b>Formulario web: Ana</b>')
    expect(tg).toContain('Abrir en el CRM')
  })
})
