import type { NextApiRequest, NextApiResponse } from 'next'
import { handleDemoWasenderWebhook } from '@/lib/demos/webhook-handler'

/**
 * POST /api/demos/webhook
 * Webhook de Wasender para demos de agentes WhatsApp.
 * Verificación: header X-Webhook-Signature = WASENDER_WEBHOOK_SECRET
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const webhookSecret = process.env.WASENDER_WEBHOOK_SECRET
  if (webhookSecret) {
    const signature =
      (req.headers['x-webhook-signature'] as string | undefined)?.trim() || ''
    if (!signature || signature !== webhookSecret) {
      return res.status(401).json({ error: 'Firma de webhook inválida' })
    }
  }

  try {
    const body = req.body
    if (!body || typeof body !== 'object') {
      return res.status(200).json({ ok: true, ignored: true })
    }

    const result = await handleDemoWasenderWebhook(body)

    if (!result.handled && result.reason === 'no_active_demo') {
      return res.status(200).json({ ok: true, ignored: true })
    }

    if (!result.handled) {
      return res.status(200).json({ ok: true, ignored: true, reason: result.reason })
    }

    return res.status(200).json({ ok: true, replied: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (process.env.NODE_ENV === 'development') console.error('[demos/webhook]', err)
    // Wasender puede reintentar; respondemos 200 si el error es de envío tras guardar
    if (msg.includes('WASENDER_API_KEY')) {
      return res.status(200).json({ ok: false, error: 'wasender_not_configured' })
    }
    return res.status(500).json({ error: msg })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
}
