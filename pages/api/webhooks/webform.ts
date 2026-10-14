import type { NextApiRequest, NextApiResponse } from 'next'
import { acceptInbound } from '@/lib/ingest/events'
import { bearerMatches, envSecret } from '@/lib/ingest/auth'
import { webFormExternalId } from '@/lib/ingest/web-form'

/**
 * POST /api/webhooks/webform
 * Formularios de la web (n8n). Preferible a INSERT directo en Postgres.
 * Auth: Bearer WEBFORM_WEBHOOK_TOKEN o INGEST_TOKEN.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'webform-webhook',
      hint: 'POST el JSON del formulario (cuerpo + etiqueta). Authorization: Bearer <WEBFORM_WEBHOOK_TOKEN o INGEST_TOKEN>.',
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const expected = envSecret('WEBFORM_WEBHOOK_TOKEN') || envSecret('INGEST_TOKEN')
  if (!expected) return res.status(503).json({ error: 'Configura WEBFORM_WEBHOOK_TOKEN o INGEST_TOKEN' })
  if (!bearerMatches(req, expected)) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const out = await acceptInbound({
      source: 'web_form',
      externalId: webFormExternalId(req.body),
      eventType: 'submission',
      payload: req.body,
    })
    if (out.status === 'ignored') return res.status(400).json({ error: 'Envío vacío', ...out })
    return res.status(out.duplicate ? 200 : 201).json(out)
  } catch (err) {
    console.error('[webhooks/webform]', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
  }
}
