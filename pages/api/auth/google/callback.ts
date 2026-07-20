import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession } from '@/lib/auth'
import {
  authUserFromGoogleAdmin,
  exchangeGoogleLoginCode,
  isGoogleAdminEmail,
  parseGoogleLoginState,
} from '@/lib/auth-google'
import { defaultHomeForRole } from '@/lib/auth-rbac'

/**
 * GET /api/auth/google/callback
 * Callback OAuth login admin (mismo Client ID que Calendar, redirect distinto).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const fail = (msg: string) => {
    res.redirect(302, `/login?error=${encodeURIComponent(msg)}`)
  }

  try {
    const err = typeof req.query.error === 'string' ? req.query.error : ''
    if (err) {
      return fail(
        err === 'access_denied' ? 'Acceso cancelado en Google' : `Google: ${err}`
      )
    }

    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    if (!code || !state) {
      return fail('Callback OAuth inválido')
    }
    if (!parseGoogleLoginState(state)) {
      return fail('State OAuth inválido o expirado')
    }

    const profile = await exchangeGoogleLoginCode(code)
    if (!isGoogleAdminEmail(profile.email)) {
      console.warn('[auth/google/callback] email no autorizado', profile.email)
      return fail(
        'Este correo de Google no tiene acceso de administrador al CRM Buffalo'
      )
    }

    const user = authUserFromGoogleAdmin(profile.email, profile.name)
    await createSession(user, res)
    return res.redirect(302, defaultHomeForRole(user.role))
  } catch (e) {
    console.error('[auth/google/callback]', e)
    return fail(e instanceof Error ? e.message : 'Error al autenticar con Google')
  }
}
