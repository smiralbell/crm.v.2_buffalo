import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  createInvoiceCheckoutUrl,
  isStripeConfigured,
  loadInvoiceForCheckout,
  paymentLinkState,
} from '@/lib/payments/stripe'

function requestOrigin(req: NextApiRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || 'https'
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.headers.host || ''
  if (process.env.APP_BASE_URL?.trim()) return process.env.APP_BASE_URL.trim().replace(/\/$/, '')
  if (host) return `${proto}://${host}`
  return 'http://localhost:3000'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = Number(req.query.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id inválido' })

  if (req.method === 'GET') {
    const state = await paymentLinkState(id)
    if (!state) return res.status(404).json({ error: 'Factura no encontrada' })
    return res.status(200).json(state)
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!isStripeConfigured()) {
    return res.status(503).json({
      configured: false,
      error: 'Falta STRIPE_SECRET_KEY. Cuando la tengas, este botón creará el enlace de pago.',
    })
  }

  const invoice = await loadInvoiceForCheckout(id)
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' })
  try {
    const out = await createInvoiceCheckoutUrl(invoice, requestOrigin(req))
    return res.status(200).json({ configured: true, url: out.url, session_id: out.sessionId })
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'No se pudo crear el enlace' })
  }
}
