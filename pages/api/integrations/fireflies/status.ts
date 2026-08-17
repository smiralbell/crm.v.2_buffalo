import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { isFirefliesConfigured } from '@/lib/integrations/fireflies/client'
import { getCrmBaseUrl } from '@/lib/tickets/config'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const base = getCrmBaseUrl(req)
  return res.status(200).json({
    ok: true,
    api_configured: isFirefliesConfigured(),
    webhook_secret_configured: Boolean(process.env.FIREFLIES_WEBHOOK_SECRET?.trim()),
    webhook_url: `${base}/api/webhooks/fireflies`,
    setup_url: 'https://app.fireflies.ai/integrations/api/webhook',
    events: ['meeting.transcribed', 'meeting.summarized'],
  })
}
