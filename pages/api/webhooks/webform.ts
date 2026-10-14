import type { NextApiRequest, NextApiResponse } from 'next'
import {
  insertWebFormSubmission,
  webFormBearerMatches,
  webFormWebhookToken,
} from '@/lib/marketing/web-form-submissions'

/**
 * POST /api/webhooks/webform
 * Un webhook para todas las webs Buffalo. Sin n8n.
 *   { site: "agenciabuffalo.es", page: "/contacto", form: { nombre, email, … } }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'webform-webhook',
      auth: 'Authorization: Bearer <WEBFORM_WEBHOOK_TOKEN o INGEST_TOKEN>',
      example: {
        site: 'agenciabuffalo.es',
        page: '/contacto',
        form: {
          nombre: 'Ana López',
          email: 'ana@empresa.com',
          telefono: '+34600000000',
          empresa: 'Empresa',
          mensaje: 'Quiero una demo',
          tipo: 'Agente de llamadas',
        },
      },
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!webFormWebhookToken()) {
    return res.status(503).json({ error: 'Configura WEBFORM_WEBHOOK_TOKEN o INGEST_TOKEN' })
  }
  if (!webFormBearerMatches(req)) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const submission = await insertWebFormSubmission(req.body)
    return res.status(201).json({
      ok: true,
      id: submission.id,
      site: submission.site,
      page: submission.page,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('vacío')) return res.status(400).json({ error: msg })
    console.error('[webhooks/webform]', err)
    return res.status(500).json({ error: msg })
  }
}
