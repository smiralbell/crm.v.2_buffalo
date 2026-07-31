/** GET /api/auth/google-drive → OAuth para obtener GOOGLE_DRIVE_REFRESH_TOKEN */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getDriveAuthUrl } from '@/lib/integrations/google/drive-auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.redirect(getDriveAuthUrl())
}
