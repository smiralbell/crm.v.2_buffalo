import type { NextApiRequest, NextApiResponse } from 'next'
import { handleDemoWasenderWebhook } from '@/lib/demos/webhook-handler'
import { logDemoWebhook } from '@/lib/demos/webhook-log'

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
  const signature =
    (req.headers['x-webhook-signature'] as string | undefined)?.trim() || ''

  if (webhookSecret) {
    if (!signature || signature !== webhookSecret) {
      await logDemoWebhook({
        step: 'auth_failed',
        level: 'error',
        message: 'Firma de webhook inválida (X-Webhook-Signature no coincide)',
        details: {
          signature_received: signature ? `${signature.slice(0, 8)}…` : '(vacío)',
          hint: 'WASENDER_WEBHOOK_SECRET debe coincidir con el Webhook Secret de Wasender',
        },
        raw_body: req.body,
      })
      return res.status(401).json({ error: 'Firma de webhook inválida' })
    }
  } else {
    await logDemoWebhook({
      step: 'auth_skipped',
      level: 'warn',
      message: 'WASENDER_WEBHOOK_SECRET no configurado — webhook sin verificación',
    })
  }

  try {
    const body = req.body
    if (!body || typeof body !== 'object') {
      await logDemoWebhook({
        step: 'empty_body',
        level: 'warn',
        message: 'Body vacío',
      })
      return res.status(200).json({ ok: true, ignored: true })
    }

    const result = await handleDemoWasenderWebhook(body)

    if (!result.handled) {
      return res.status(200).json({ ok: true, ignored: true, reason: result.reason })
    }

    return res.status(200).json({ ok: true, replied: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    await logDemoWebhook({
      step: 'handler_error',
      level: 'error',
      message: msg,
      raw_body: req.body,
    })
    if (msg.includes('WASENDER_API_KEY')) {
      return res.status(200).json({ ok: false, error: 'wasender_not_configured' })
    }
    if (msg.includes('OPENROUTER')) {
      return res.status(200).json({ ok: false, error: 'openrouter_error', message: msg })
    }
    return res.status(500).json({ error: msg })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
}
