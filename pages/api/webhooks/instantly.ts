import type { NextApiRequest, NextApiResponse } from 'next'
import { acceptInbound } from '@/lib/ingest/events'
import { bearerMatches, envSecret } from '@/lib/ingest/auth'
import { instantlyEventType, instantlyExternalId } from '@/lib/ingest/instantly'

/**
 * POST /api/webhooks/instantly
 * Instantly → CRM. Token: INSTANTLY_WEBHOOK_TOKEN (si falta, se acepta el valor legado).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const expected = envSecret('INSTANTLY_WEBHOOK_TOKEN', 'buf-instantly-2026')
  if (!bearerMatches(req, expected)) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const out = await acceptInbound({
      source: 'instantly',
      externalId: instantlyExternalId(req.body),
      eventType: instantlyEventType(req.body),
      payload: req.body,
    })
    return res.status(200).json(out)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    console.error('[webhooks/instantly]', err)
    return res.status(500).json({ error: msg })
  }
}
