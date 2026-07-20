import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { buildGoogleConnectUrl } from '@/lib/integrations/google/oauth'
import { ensureGoogleConnectionsTable } from '@/lib/integrations/google/store'

/**
 * GET /api/integrations/google/connect
 * Redirige al consentimiento OAuth de Google (offline + calendar.readonly).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await requireAuthAPI(req, res)
    await ensureGoogleConnectionsTable()
    const url = buildGoogleConnectUrl(user)
    return res.redirect(302, url)
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'No session' || e.message === 'Invalid session' || e.message === 'Expired session')
    ) {
      return
    }
    const msg = e instanceof Error ? e.message : 'Error OAuth'
    console.error('[google/connect]', e)
    return res.redirect(302, `/calendario?error=${encodeURIComponent(msg)}`)
  }
}
