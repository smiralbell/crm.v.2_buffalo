import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { googleOwnerKey } from '@/lib/integrations/google/owner'
import { runGmailSyncOnce } from '@/lib/integrations/google/gmail-sync-scheduler'

/**
 * POST /api/integrations/google/gmail-sync
 * Sincroniza ahora el buzón del usuario actual con el historial CRM.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  try {
    return res.status(200).json(await runGmailSyncOnce('manual', googleOwnerKey(user)))
  } catch (e) {
    console.error('[google/gmail-sync]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error' })
  }
}
