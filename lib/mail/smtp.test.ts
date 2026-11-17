import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSmtpConfig, isSmtpConfigured } from './smtp'

const saved = { ...process.env }

beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith('SMTP_') || k.startsWith('INVOICES_SMTP_')) delete process.env[k]
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.buffaloia.com',
    SMTP_PORT: '465',
    SMTP_USER: 'crm@buffaloia.com',
    SMTP_PASS: 'clave-crm',
    SMTP_FROM: 'crm@buffaloia.com',
    SMTP_FROM_NAME: 'Buffalo CRM',
  })
})

afterEach(() => {
  process.env = { ...saved }
})

describe('getSmtpConfig', () => {
  it('los avisos internos siguen saliendo de la cuenta general', () => {
    const cfg = getSmtpConfig()
    expect(cfg).toMatchObject({ user: 'crm@buffaloia.com', pass: 'clave-crm', from: 'crm@buffaloia.com', fromName: 'Buffalo CRM' })
  })

  it('sin variables de facturas, las facturas usan la cuenta general con el nombre «Buffalo AI»', () => {
    expect(getSmtpConfig('invoices')).toMatchObject({ user: 'crm@buffaloia.com', from: 'crm@buffaloia.com', fromName: 'Buffalo AI' })
  })

  it('con cuenta propia, las facturas entran y salen como admin@', () => {
    process.env.INVOICES_SMTP_USER = 'admin@buffaloia.com'
    process.env.INVOICES_SMTP_PASS = 'clave-admin'
    const cfg = getSmtpConfig('invoices')
    expect(cfg).toMatchObject({
      host: 'smtp.buffaloia.com',
      user: 'admin@buffaloia.com',
      pass: 'clave-admin',
      from: 'admin@buffaloia.com',
    })
    // y los avisos no cambian
    expect(getSmtpConfig().from).toBe('crm@buffaloia.com')
  })

  it('si falta la contraseña de la cuenta de facturas, no se usa la de crm@', () => {
    process.env.INVOICES_SMTP_USER = 'admin@buffaloia.com'
    expect(isSmtpConfigured('invoices')).toBe(false)
    expect(() => getSmtpConfig('invoices')).toThrow(/INVOICES_SMTP_PASS/)
  })

  it('se puede cambiar solo el remitente visible y el nombre', () => {
    process.env.INVOICES_SMTP_FROM = 'admin@buffaloia.com'
    process.env.INVOICES_SMTP_FROM_NAME = 'Facturación Buffalo'
    expect(getSmtpConfig('invoices')).toMatchObject({
      user: 'crm@buffaloia.com',
      from: 'admin@buffaloia.com',
      fromName: 'Facturación Buffalo',
    })
  })
})
