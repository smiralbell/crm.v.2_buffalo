import type { NextApiRequest, NextApiResponse } from 'next'
import { google } from 'googleapis'
import {
  getGoogleOAuth2Client,
  parseOAuthState,
} from '@/lib/integrations/google/oauth'
import { upsertGoogleTokens } from '@/lib/integrations/google/store'

/**
 * GET /api/integrations/google/callback
 * Intercambia code por tokens, cifra y guarda en DB. No expone tokens al cliente.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const error = typeof req.query.error === 'string' ? req.query.error : ''
  if (error) {
    return res.redirect(
      302,
      `/calendario?error=${encodeURIComponent('Autorización cancelada o denegada')}`
    )
  }

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!code || !state) {
    return res.redirect(302, `/calendario?error=${encodeURIComponent('Callback OAuth inválido')}`)
  }

  const parsed = parseOAuthState(state)
  if (!parsed) {
    return res.redirect(302, `/calendario?error=${encodeURIComponent('State OAuth inválido o expirado')}`)
  }

  try {
    const client = getGoogleOAuth2Client()
    const { tokens } = await client.getToken(code)
    if (!tokens.access_token) {
      throw new Error('Google no devolvió access_token')
    }

    client.setCredentials(tokens)
    let googleEmail: string | null = null
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: client })
      const me = await oauth2.userinfo.get()
      googleEmail = me.data.email || null
    } catch {
      // email opcional
    }

    await upsertGoogleTokens({
      ownerKey: parsed.ownerKey,
      googleEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: tokens.scope || null,
    })

    return res.redirect(302, '/calendario?connected=1')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al conectar Google'
    console.error('[google/callback]', e)
    return res.redirect(302, `/calendario?error=${encodeURIComponent(msg)}`)
  }
}
