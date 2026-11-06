import type { NextApiRequest, NextApiResponse } from 'next'
import { isWhatsAppAgentEnabled, validWhatsAppSecret } from '@/lib/whatsapp-agent/config'
import { handleWhatsAppWebhook } from '@/lib/whatsapp-agent/handler'
import { startWhatsAppAgent } from '@/lib/whatsapp-agent/setup'

export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
}

/**
 * Webhook de Evolution API (agente del CRM por WhatsApp).
 * Contesta 200 al momento y procesa después: el agente puede tardar más de lo que
 * Evolution espera.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!isWhatsAppAgentEnabled()) return res.status(200).json({ ok: true, disabled: true })

  const secret = String(req.query.secret || req.headers['x-webhook-secret'] || '')
  if (!validWhatsAppSecret(secret)) return res.status(401).json({ error: 'No autorizado' })

  startWhatsAppAgent()
  const body = req.body
  res.status(200).json({ ok: true })

  void handleWhatsAppWebhook(body).catch((e) => {
    console.error('[whatsapp-agent] webhook', e)
  })
}
