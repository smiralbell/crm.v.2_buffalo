import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { googleOwnerKey } from '@/lib/integrations/google/owner'
import {
  decryptConnectionTokens,
  deleteConnection,
  ensureGoogleConnectionsTable,
  getConnectionByOwner,
} from '@/lib/integrations/google/store'

/**
 * POST /api/integrations/google/disconnect
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await requireAuthAPI(req, res)
    await ensureGoogleConnectionsTable()
    const ownerKey = googleOwnerKey(user)
    const row = await getConnectionByOwner(ownerKey)

    if (row) {
      try {
        const { accessToken, refreshToken } = decryptConnectionTokens(row)
        const token = refreshToken || accessToken
        if (token) {
          await fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
          )
        }
      } catch {
        // best-effort revoke
      }
      await deleteConnection(ownerKey)
    }

    return res.status(200).json({ success: true })
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'No session' || e.message === 'Invalid session' || e.message === 'Expired session')
    ) {
      return
    }
    console.error('[google/disconnect]', e)
    return res.status(500).json({ error: 'Error al desconectar Google' })
  }
}
