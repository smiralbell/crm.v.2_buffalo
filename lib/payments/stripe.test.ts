import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  eurosToCents,
  invoiceIdFromRef,
  invoiceRef,
  parseStripeEvent,
  verifyStripeSignature,
} from '@/lib/payments/stripe'

function sign(body: string, secret: string, t: number): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${v1}`
}

describe('Stripe: firma y eventos', () => {
  const secret = 'whsec_test'
  const body = '{"id":"evt_1","type":"checkout.session.completed"}'
  const t = 1_700_000_000

  it('acepta una firma válida dentro de la ventana', () => {
    expect(verifyStripeSignature(body, sign(body, secret, t), secret, t * 1000)).toBe(true)
  })

  it('rechaza cuerpo distinto, secreto distinto o cabecera vieja', () => {
    expect(verifyStripeSignature(body + 'x', sign(body, secret, t), secret, t * 1000)).toBe(false)
    expect(verifyStripeSignature(body, sign(body, secret, t), 'otro', t * 1000)).toBe(false)
    expect(verifyStripeSignature(body, sign(body, secret, t), secret, (t + 400) * 1000)).toBe(false)
    expect(verifyStripeSignature(body, undefined, secret, t * 1000)).toBe(false)
  })

  it('euros → céntimos redondeados', () => {
    expect(eurosToCents(1210)).toBe(121000)
    expect(eurosToCents(10.555)).toBe(1056)
  })

  it('referencia de factura', () => {
    expect(invoiceRef(42)).toBe('invoice:42')
    expect(invoiceIdFromRef('invoice:42')).toBe(42)
    expect(invoiceIdFromRef('42')).toBe(42)
    expect(invoiceIdFromRef('nope')).toBeNull()
  })

  it('Checkout pagado con metadata', () => {
    const p = parseStripeEvent({
      id: 'evt_cs',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          payment_status: 'paid',
          amount_total: 121000,
          client_reference_id: 'invoice:9',
          metadata: { invoice_number: 'BUF-1' },
        },
      },
    })
    expect(p).toMatchObject({
      eventId: 'evt_cs',
      kind: 'checkout.session.completed',
      paid: true,
      invoiceId: 9,
      sessionId: 'cs_123',
      amountCents: 121000,
    })
  })

  it('PaymentIntent pagado; ignora eventos que no son cobro', () => {
    expect(
      parseStripeEvent({
        id: 'evt_pi',
        type: 'payment_intent.succeeded',
        data: { object: { metadata: { invoice_id: '7' }, amount: 5000 } },
      })
    ).toMatchObject({ kind: 'payment_intent.succeeded', paid: true, invoiceId: 7 })
    expect(parseStripeEvent({ id: 'evt_x', type: 'customer.created', data: { object: {} } })).toMatchObject({
      kind: 'other',
      paid: false,
      invoiceId: null,
    })
    expect(parseStripeEvent({})).toBeNull()
  })
})
