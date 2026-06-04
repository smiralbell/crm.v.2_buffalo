// GET /api/auth/google-calendar → redirige al flujo OAuth de Google
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getAuthUrl } from '@/lib/google-calendar'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return
  const url = getAuthUrl()
  res.redirect(url)
}
