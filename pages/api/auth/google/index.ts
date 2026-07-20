import type { NextApiRequest, NextApiResponse } from 'next'
import { buildGoogleLoginUrl } from '@/lib/auth-google'

/**
 * GET /api/auth/google
 * Inicia OAuth de Google para login admin (allowlist).
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const url = buildGoogleLoginUrl()
    return res.redirect(302, url)
  } catch (e) {
    console.error('[auth/google]', e)
    const msg = e instanceof Error ? e.message : 'Google OAuth no configurado'
    return res.redirect(302, `/login?error=${encodeURIComponent(msg)}`)
  }
}
