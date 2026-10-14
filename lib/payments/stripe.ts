/**
 * Pasarela Stripe (lado CRM). Sin STRIPE_SECRET_KEY no llama a nada:
 * el botón de la factura explica qué falta y el webhook responde 503.
 *
 * Checkout Session vía REST (sin SDK). El webhook entra por la ingesta unificada.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { query } from '@/lib/db'
import { notify } from '@/lib/alerts'

export type StripeEventKind = 'checkout.session.completed' | 'payment_intent.succeeded' | 'other'

export type ParsedStripeEvent = {
  eventId: string
  type: string
  kind: StripeEventKind
  paid: boolean
  invoiceId: number | null
  invoiceNumber: string | null
  sessionId: string | null
  amountCents: number | null
}

const SIG_TOLERANCE_SEC = 300

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())
}

export function eurosToCents(euros: number): number {
  return Math.round(Number(euros) * 100)
}

export function invoiceRef(id: number): string {
  return `invoice:${id}`
}

export function invoiceIdFromRef(ref: unknown): number | null {
  const s = typeof ref === 'string' ? ref.trim() : ''
  const m = /^invoice:(\d+)$/.exec(s)
  if (m) return Number(m[1])
  const n = Number(s)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '',
  nowMs = Date.now()
): boolean {
  if (!header || !secret) return false
  const items: Record<string, string[]> = {}
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq < 1) continue
    const k = part.slice(0, eq).trim()
    const v = part.slice(eq + 1).trim()
    if (!k || !v) continue
    ;(items[k] ||= []).push(v)
  }
  const t = items.t?.[0]
  const v1 = items.v1 || []
  if (!t || !v1.length) return false
  const age = Math.abs(nowMs / 1000 - Number(t))
  if (!Number.isFinite(Number(t)) || age > SIG_TOLERANCE_SEC) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  return v1.some((sig) => {
    const got = Buffer.from(sig, 'utf8')
    return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)
  })
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Extrae lo que el CRM necesita del evento crudo de Stripe (Checkout o PaymentIntent).
 */
export function parseStripeEvent(payload: unknown): ParsedStripeEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const ev = payload as Record<string, unknown>
  const eventId = str(ev.id)
  const type = str(ev.type)
  if (!eventId || !type) return null
  const obj =
    ev.data && typeof ev.data === 'object'
      ? ((ev.data as { object?: Record<string, unknown> }).object ?? {})
      : {}
  const meta = (obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {}) as Record<string, unknown>
  const invoiceId =
    invoiceIdFromRef(meta.invoice_id) ||
    invoiceIdFromRef(obj.client_reference_id) ||
    invoiceIdFromRef(meta.invoiceId)
  const paid =
    type === 'payment_intent.succeeded' ||
    str(obj.payment_status) === 'paid' ||
    str(obj.status) === 'complete' ||
    str(obj.status) === 'succeeded'
  const kind: StripeEventKind =
    type === 'checkout.session.completed'
      ? 'checkout.session.completed'
      : type === 'payment_intent.succeeded'
        ? 'payment_intent.succeeded'
        : 'other'
  const sessionId =
    type === 'checkout.session.completed' ? str(obj.id) : str(obj.checkout_session) || null
  return {
    eventId,
    type,
    kind,
    paid,
    invoiceId,
    invoiceNumber: str(meta.invoice_number),
    sessionId,
    amountCents: num(obj.amount_total) ?? num(obj.amount),
  }
}

export async function applyStripePayment(
  parsed: ParsedStripeEvent
): Promise<{ status: 'processed' | 'ignored'; result: Record<string, unknown> }> {
  if (parsed.kind === 'other' || !parsed.paid) {
    return { status: 'ignored', result: { reason: 'not_a_payment', type: parsed.type } }
  }
  if (!parsed.invoiceId) {
    return { status: 'ignored', result: { reason: 'no_invoice_id', type: parsed.type } }
  }
  const upd = await query<{ invoice_number: string; client_name: string; total: string | number; paid_via: string | null }>(
    `UPDATE invoices
        SET paid_via = COALESCE(paid_via, 'stripe'),
            stripe_paid_at = COALESCE(stripe_paid_at, NOW()),
            stripe_checkout_session_id = COALESCE($2, stripe_checkout_session_id),
            updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING invoice_number, client_name, total, paid_via`,
    [parsed.invoiceId, parsed.sessionId]
  )
  const row = upd.rows[0]
  if (!row) return { status: 'ignored', result: { reason: 'invoice_not_found', id: parsed.invoiceId } }
  if (row.paid_via !== 'stripe') {
    return {
      status: 'processed',
      result: { invoice_id: parsed.invoiceId, invoice_number: row.invoice_number, already: row.paid_via },
    }
  }
  await notify({
    kind: 'finanzas.stripe',
    title: `${row.invoice_number} cobrada por Stripe`,
    body: `${row.client_name} · ${Number(row.total).toFixed(2)} €`,
    link: `/invoices/${parsed.invoiceId}/edit`,
    severity: 'info',
    dedupeKey: `stripe-paid:${parsed.invoiceId}`,
  })
  return {
    status: 'processed',
    result: {
      invoice_id: parsed.invoiceId,
      invoice_number: row.invoice_number,
      session_id: parsed.sessionId,
    },
  }
}

type InvoiceForCheckout = {
  id: number
  invoice_number: string
  client_name: string
  client_email: string | null
  total: number
  status: string
}

export async function loadInvoiceForCheckout(id: number): Promise<InvoiceForCheckout | null> {
  const { rows } = await query<InvoiceForCheckout>(
    `SELECT id, invoice_number, client_name, client_email, total::float8 AS total, status
       FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows[0] ?? null
}

export type PaymentLinkState = {
  configured: boolean
  webhook_configured: boolean
  payment_url: string | null
  paid_via: string | null
  stripe_paid_at: string | null
  stripe_checkout_session_id: string | null
}

export async function paymentLinkState(id: number): Promise<PaymentLinkState | null> {
  try {
    const { rows } = await query<{
      payment_url: string | null
      paid_via: string | null
      stripe_paid_at: Date | null
      stripe_checkout_session_id: string | null
    }>(
      `SELECT payment_url, paid_via, stripe_paid_at, stripe_checkout_session_id
         FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    const row = rows[0]
    if (!row) return null
    return {
      configured: isStripeConfigured(),
      webhook_configured: isStripeWebhookConfigured(),
      payment_url: row.payment_url,
      paid_via: row.paid_via,
      stripe_paid_at: row.stripe_paid_at ? row.stripe_paid_at.toISOString() : null,
      stripe_checkout_session_id: row.stripe_checkout_session_id,
    }
  } catch (e) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === '42703') {
      return {
        configured: isStripeConfigured(),
        webhook_configured: isStripeWebhookConfigured(),
        payment_url: null,
        paid_via: null,
        stripe_paid_at: null,
        stripe_checkout_session_id: null,
      }
    }
    throw e
  }
}

function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

export async function createInvoiceCheckoutUrl(
  invoice: InvoiceForCheckout,
  origin: string
): Promise<{ url: string; sessionId: string }> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret) throw new Error('STRIPE_SECRET_KEY no está configurada')
  if (invoice.status === 'cancelled') throw new Error('La factura está cancelada')
  const cents = eurosToCents(invoice.total)
  if (cents < 50) throw new Error('Stripe no acepta cobros de menos de 0,50 €')

  const base = origin.replace(/\/$/, '')
  const success = `${base}/invoices/${invoice.id}/edit?paid=1`
  const cancel = `${base}/invoices/${invoice.id}/edit?paid=0`
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody({
      mode: 'payment',
      success_url: success,
      cancel_url: cancel,
      client_reference_id: invoiceRef(invoice.id),
      'metadata[invoice_id]': String(invoice.id),
      'metadata[invoice_number]': invoice.invoice_number,
      'payment_intent_data[metadata][invoice_id]': String(invoice.id),
      'payment_intent_data[metadata][invoice_number]': invoice.invoice_number,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][product_data][name]': `Factura ${invoice.invoice_number}`,
      ...(invoice.client_email ? { customer_email: invoice.client_email } : {}),
    }),
  })
  const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } }
  if (!res.ok || !json.id || !json.url) {
    throw new Error(json.error?.message || `Stripe ${res.status}`)
  }
  await query(
    `UPDATE invoices
        SET payment_url = $2, stripe_checkout_session_id = $3, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL`,
    [invoice.id, json.url, json.id]
  )
  return { url: json.url, sessionId: json.id }
}
