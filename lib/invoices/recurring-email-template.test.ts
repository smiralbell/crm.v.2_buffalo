import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EMAIL_BODY,
  DEFAULT_EMAIL_SUBJECT,
  emailHtml,
  emailSendDate,
  fillTemplate,
  invoiceEmailVars,
  parseEmailList,
} from './recurring-email-template'

const vars = invoiceEmailVars({
  invoice_number: 'BUF-2026-041',
  client_name: 'Laura Pérez',
  client_company_name: 'Acme S.L.',
  total: 363,
  issue_date: '2026-11-05',
  due_date: '2026-11-15',
  services: [{ description: 'Mantenimiento del 5 de octubre al 5 de noviembre' }],
})

describe('invoiceEmailVars', () => {
  it('rellena número, cliente, total, mes y fechas', () => {
    expect(vars.numero).toBe('BUF-2026-041')
    expect(vars.cliente).toBe('Acme S.L.')
    expect(vars.total.replace(/\s/g, ' ')).toBe('363,00 €')
    expect(vars.mes).toBe('noviembre 2026')
    expect(vars.fecha).toBe('05/11/2026')
    expect(vars.vencimiento).toBe('15/11/2026')
    expect(vars.concepto).toBe('Mantenimiento del 5 de octubre al 5 de noviembre')
  })

  it('sin empresa usa el nombre, y sin vencimiento la fecha de emisión', () => {
    const v = invoiceEmailVars({ invoice_number: 'X', client_name: 'Laura', total: 10, issue_date: '2026-01-31' })
    expect(v.cliente).toBe('Laura')
    expect(v.vencimiento).toBe('31/01/2026')
  })
})

describe('fillTemplate', () => {
  it('cambia las llaves conocidas, sin importar mayúsculas ni espacios', () => {
    expect(fillTemplate('Factura {numero} · { MES } para {cliente}', vars)).toBe(
      'Factura BUF-2026-041 · noviembre 2026 para Acme S.L.'
    )
  })

  it('deja tal cual lo que no conoce', () => {
    expect(fillTemplate('Hola {nombre}', vars)).toBe('Hola {nombre}')
  })

  it('la plantilla por defecto no deja llaves sin rellenar', () => {
    expect(fillTemplate(DEFAULT_EMAIL_SUBJECT, vars)).not.toMatch(/\{/)
    expect(fillTemplate(DEFAULT_EMAIL_BODY, vars)).not.toMatch(/\{/)
  })
})

describe('parseEmailList', () => {
  it('separa por comas, punto y coma o espacios y quita repetidos', () => {
    expect(parseEmailList('a@x.com, b@y.es;A@x.com  c@z.io')).toEqual({
      emails: ['a@x.com', 'b@y.es', 'c@z.io'],
      invalid: [],
    })
  })

  it('señala lo que no es un email', () => {
    expect(parseEmailList('a@x.com, pepe').invalid).toEqual(['pepe'])
    expect(parseEmailList('')).toEqual({ emails: [], invalid: [] })
  })
})

describe('emailSendDate', () => {
  it('sin día elegido, el mismo día de la factura', () => {
    expect(emailSendDate('2026-11-05', null)).toBe('2026-11-05')
  })
  it('un día posterior del mismo mes', () => {
    expect(emailSendDate('2026-11-05', 10)).toBe('2026-11-10')
    expect(emailSendDate('2026-11-05', 5)).toBe('2026-11-05')
  })
  it('si el día ya ha pasado, el del mes siguiente', () => {
    expect(emailSendDate('2026-11-28', 1)).toBe('2026-12-01')
    expect(emailSendDate('2026-12-20', 3)).toBe('2027-01-03')
  })
  it('en meses cortos, el último día', () => {
    expect(emailSendDate('2026-02-10', 31)).toBe('2026-02-28')
    expect(emailSendDate('2026-01-31', 30)).toBe('2026-02-28')
  })
})

describe('emailHtml', () => {
  it('escapa el HTML y respeta párrafos y saltos de línea', () => {
    const html = emailHtml('Hola <b>Ana</b>,\n\nLínea 1\nLínea 2')
    expect(html).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;,')
    expect(html).toContain('Línea 1<br>Línea 2')
    expect(html.match(/<p /g)).toHaveLength(2)
  })
})
