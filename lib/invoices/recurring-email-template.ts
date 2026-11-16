import { monthLabel, parseIsoDate } from '@/lib/invoices/recurring-dates'

/**
 * Plantillas y reglas del envío por email de las facturas recurrentes.
 * Sin base de datos: se usa en el servidor y en la pantalla (vista previa).
 */

export const DEFAULT_EMAIL_SUBJECT = 'Factura {numero} · {mes}'

export const DEFAULT_EMAIL_BODY = `Hola,

Te adjuntamos la factura {numero} de {mes}, por un importe de {total}.

Si tienes cualquier duda, responde a este correo.

Un saludo,
Buffalo AI`

export const DEFAULT_SEND_TIME = '09:00'

/** Lo que se puede poner entre llaves en el asunto y el mensaje. */
export const EMAIL_PLACEHOLDERS = [
  { key: 'numero', label: 'Número de factura', example: 'BUF-2026-041' },
  { key: 'cliente', label: 'Cliente (empresa o nombre)', example: 'Acme S.L.' },
  { key: 'total', label: 'Total con IVA', example: '363,00 €' },
  { key: 'mes', label: 'Mes de la factura', example: 'noviembre 2026' },
  { key: 'fecha', label: 'Fecha de emisión', example: '05/11/2026' },
  { key: 'vencimiento', label: 'Fecha de vencimiento', example: '15/11/2026' },
  { key: 'concepto', label: 'Concepto', example: 'Mantenimiento del 5 de octubre al 5 de noviembre' },
] as const

export type EmailPlaceholderKey = (typeof EMAIL_PLACEHOLDERS)[number]['key']
export type InvoiceEmailVars = Record<EmailPlaceholderKey, string>

export const EXAMPLE_EMAIL_VARS: InvoiceEmailVars = Object.fromEntries(
  EMAIL_PLACEHOLDERS.map((p) => [p.key, p.example])
) as InvoiceEmailVars

function ddmmyyyy(iso: string | null | undefined): string {
  const parsed = iso ? parseIsoDate(iso.slice(0, 10)) : null
  if (!parsed) return ''
  return `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}/${parsed.year}`
}

export function formatEuros(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0
  )
}

export function invoiceEmailVars(invoice: {
  invoice_number: string
  client_name: string
  client_company_name?: string | null
  total: number
  /** YYYY-MM-DD */
  issue_date: string
  due_date?: string | null
  services?: unknown
}): InvoiceEmailVars {
  const parsed = parseIsoDate(invoice.issue_date.slice(0, 10))
  const services = Array.isArray(invoice.services) ? (invoice.services as { description?: unknown }[]) : []
  return {
    numero: invoice.invoice_number,
    cliente: (invoice.client_company_name || '').trim() || invoice.client_name,
    total: formatEuros(invoice.total),
    mes: parsed ? monthLabel(parsed.year, parsed.month) : '',
    fecha: ddmmyyyy(invoice.issue_date),
    vencimiento: ddmmyyyy(invoice.due_date) || ddmmyyyy(invoice.issue_date),
    concepto: String(services[0]?.description ?? '').trim(),
  }
}

/** Cambia {numero}, {cliente}… por su valor. Lo que no conoce lo deja tal cual. */
export function fillTemplate(template: string, vars: InvoiceEmailVars): string {
  return template.replace(/\{\s*([a-zA-Záéíóú]+)\s*\}/g, (whole, raw: string) => {
    const key = raw.toLowerCase() as EmailPlaceholderKey
    return key in vars ? vars[key] : whole
  })
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

/** «a@x.com, b@y.es; c@z.com» → lista limpia y las que no parecen emails. */
export function parseEmailList(raw: string | null | undefined): { emails: string[]; invalid: string[] } {
  const parts = String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const emails: string[] = []
  const invalid: string[] = []
  for (const p of parts) {
    if (!EMAIL_RE.test(p)) invalid.push(p)
    else if (!emails.some((e) => e.toLowerCase() === p.toLowerCase())) emails.push(p)
  }
  return { emails, invalid }
}

/** «9:5» → null; «09:05» → «09:05». */
export function normalizeSendTime(raw: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function isoOf(year: number, month: number, day: number): string {
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, dim)).padStart(2, '0')}`
}

/**
 * Qué día se manda una factura emitida el `issueIso`: el primer día `sendDay`
 * desde la emisión (ese mismo mes o, si ya ha pasado, el siguiente). Sin día,
 * el mismo día de la emisión. En meses cortos, el último día.
 */
export function emailSendDate(issueIso: string, sendDay: number | null | undefined): string {
  const issue = parseIsoDate(issueIso.slice(0, 10))
  if (!issue) return issueIso.slice(0, 10)
  if (!sendDay || sendDay < 1 || sendDay > 31) return isoOf(issue.year, issue.month, issue.day)
  const sameMonth = isoOf(issue.year, issue.month, sendDay)
  if (sameMonth >= isoOf(issue.year, issue.month, issue.day)) return sameMonth
  const next = issue.month === 12 ? { year: issue.year + 1, month: 1 } : { year: issue.year, month: issue.month + 1 }
  return isoOf(next.year, next.month, sendDay)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** El mensaje en HTML sencillo: párrafos y saltos de línea, sin nada más. */
export function emailHtml(body: string): string {
  const paragraphs = body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">${paragraphs}</div>`
}
