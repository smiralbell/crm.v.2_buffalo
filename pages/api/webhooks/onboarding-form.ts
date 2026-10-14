import type { NextApiRequest, NextApiResponse } from 'next'
import { acceptInbound } from '@/lib/ingest/events'
import { bearerMatches, envSecret } from '@/lib/ingest/auth'
import { onboardingFormExternalId, onboardingFormIds } from '@/lib/ingest/onboarding-form'

/**
 * POST /api/webhooks/onboarding-form
 * Auth: Bearer ONBOARDING_FORM_WEBHOOK_TOKEN (si la variable existe).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const expected = envSecret('ONBOARDING_FORM_WEBHOOK_TOKEN')
  if (expected && !bearerMatches(req, expected)) return res.status(401).json({ error: 'Unauthorized' })

  const { leadId, email } = onboardingFormIds(req.body)
  if (!leadId && !email) {
    return res.status(400).json({ error: 'Falta leadId o email en el payload', ok: false })
  }

  try {
    const out = await acceptInbound({
      source: 'onboarding_form',
      externalId: onboardingFormExternalId(req.body),
      eventType: 'onboarding_recibido',
      payload: req.body || {},
    })
    return res.status(200).json({ ok: out.status !== 'failed', ...out.result, event_id: out.event_id })
  } catch (err) {
    console.error('[webhooks/onboarding-form]', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
  }
}
