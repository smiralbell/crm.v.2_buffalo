import type { NextApiRequest, NextApiResponse } from 'next'
import { handleDemoWhatsAppWebhook } from '@/lib/demos/webhook-handler'
import { logDemoWebhook } from '@/lib/demos/webhook-log'
import {
  isDemosWhatsAppConfigured,
  startDemosWhatsApp,
  validDemosWebhookSecret,
} from '@/lib/demos/whatsapp'

/**
 * POST /api/demos/webhook?secret=…
 * Webhook de Evolution API (instancia EVOLUTION_DEMOS_INSTANCE) para las demos de
 * agentes por WhatsApp. El CRM lo configura solo en Evolution al arrancar.
 *
 * Contesta 200 al momento y procesa después: la respuesta con «escribiendo…»
 * tarda más de lo que Evolution espera.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }
  if (!isDemosWhatsAppConfigured()) {
    return res.status(200).json({ ok: true, disabled: true })
  }

  const secret = String(req.query.secret || req.headers['x-webhook-secret'] || '')
  if (!validDemosWebhookSecret(secret)) {
    await logDemoWebhook({
      step: 'auth_failed',
      level: 'error',
      message: 'Secreto del webhook inválido (?secret= no coincide)',
      details: { hint: 'El CRM configura el webhook solo; si lo has cambiado a mano en Evolution, reinicia el CRM' },
    })
    return res.status(401).json({ error: 'No autorizado' })
  }

  startDemosWhatsApp()
  const body = req.body
  res.status(200).json({ ok: true })

  if (!body || typeof body !== 'object') return
  void handleDemoWhatsAppWebhook(body).catch(async (err) => {
    await logDemoWebhook({
      step: 'handler_error',
      level: 'error',
      message: err instanceof Error ? err.message : 'Error interno',
      raw_body: body,
    }).catch(() => {})
  })
}

export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
}
