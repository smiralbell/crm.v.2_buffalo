import type { NextApiRequest, NextApiResponse } from 'next'
import { processInboundEvent, recordInboundEvent } from '@/lib/ingest/events'
import { parseStripeEvent, verifyStripeSignature } from '@/lib/payments/stripe'
import { INBOUND_PROCESSORS } from '@/lib/ingest/processors'

export const config = {
  api: { bodyParser: false },
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Webhook de Stripe: verificar firma → guardar evento → marcar la factura cobrada.
 * URL a pegar en Stripe → Developers → Webhooks:
 *   {APP_URL}/api/webhooks/stripe
 * Eventos: checkout.session.completed, payment_intent.succeeded
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'stripe-webhook',
      configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
      hint: 'POST checkout.session.completed / payment_intent.succeeded. El secret debe coincidir con STRIPE_WEBHOOK_SECRET.',
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    return res.status(503).json({ error: 'STRIPE_WEBHOOK_SECRET no configurado' })
  }

  let raw: string
  try {
    raw = await readRawBody(req)
  } catch {
    return res.status(400).json({ error: 'Invalid body' })
  }

  const header = (req.headers['stripe-signature'] as string | undefined) || ''
  if (!verifyStripeSignature(raw, header)) {
    return res.status(401).json({ error: 'Firma de webhook inválida' })
  }

  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    return res.status(400).json({ error: 'JSON inválido' })
  }

  const parsed = parseStripeEvent(payload)
  if (!parsed) return res.status(400).json({ error: 'Evento Stripe no reconocido' })

  try {
    const recorded = await recordInboundEvent({
      source: 'stripe',
      externalId: parsed.eventId,
      eventType: parsed.type,
      payload,
    })
    if (!recorded) {
      const out = await INBOUND_PROCESSORS.stripe(payload)
      return res.status(200).json({ ok: true, ...out })
    }
    if (recorded.duplicate && recorded.status !== 'failed') {
      return res.status(200).json({ ok: true, duplicate: true, event_id: recorded.id })
    }
    const out = await processInboundEvent(recorded.id)
    return res.status(200).json({
      ok: true,
      event_id: recorded.id,
      status: out?.status ?? recorded.status,
      result: out?.result,
    })
  } catch (e) {
    console.error('[webhooks/stripe]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' })
  }
}
