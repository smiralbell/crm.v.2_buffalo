import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { googleOwnerKey } from '@/lib/integrations/google/owner'
import {
  ensureGoogleConnectionsTable,
  getConnectionByOwner,
} from '@/lib/integrations/google/store'

/**
 * GET /api/integrations/google/status
 * Estado de conexión (sin tokens).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await requireAuthAPI(req, res)
    await ensureGoogleConnectionsTable()
    const ownerKey = googleOwnerKey(user)
    const row = await getConnectionByOwner(ownerKey)

    if (!row) {
      return res.status(200).json({
        connected: false,
        email: null,
        needs_reauth: false,
      })
    }

    return res.status(200).json({
      connected: Boolean(row.refresh_token_enc) && !row.needs_reauth,
      email: row.google_email,
      needs_reauth: row.needs_reauth,
    })
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'No session' || e.message === 'Invalid session' || e.message === 'Expired session')
    ) {
      return
    }
    console.error('[google/status]', e)
    return res.status(500).json({ error: 'Error al leer estado Google' })
  }
}
