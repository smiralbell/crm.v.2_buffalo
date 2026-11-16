import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import { google } from 'googleapis'
import type { AuthUser, CrmRole } from '@/lib/auth'
import { findCrmUserByEmail } from '@/lib/crm-users'
import { AGENCY_GOOGLE_EMAIL } from '@/lib/agency-google'


export function getGoogleLoginRedirectUri(): string {
  if (process.env.GOOGLE_LOGIN_REDIRECT_URI) {
    return process.env.GOOGLE_LOGIN_REDIRECT_URI.replace(/([^:]\/)\/+/g, '$1')
  }
  const base = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${base}/api/auth/google/callback`
}

export function getGoogleLoginOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben estar configurados')
  }
  return new google.auth.OAuth2(clientId, clientSecret, getGoogleLoginRedirectUri())
}

/** La cuenta de la agencia entra como administrador general (sin usuario propio). */
export function isAgencyGoogleEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.trim().toLowerCase() === AGENCY_GOOGLE_EMAIL
}

function stateSecret(): string {
  return process.env.SESSION_SECRET || 'default-secret-change-in-production'
}

/** state firmado para login: login|nonce|exp|sig */
export function createGoogleLoginState(): string {
  const nonce = randomBytes(8).toString('hex')
  const exp = String(Date.now() + 15 * 60 * 1000)
  const payload = `login|${nonce}|${exp}`
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}|${sig}`).toString('base64url')
}

export function parseGoogleLoginState(state: string): boolean {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const parts = decoded.split('|')
    if (parts.length !== 4) return false
    const [kind, nonce, exp, sig] = parts
    if (kind !== 'login' || !nonce || !exp || !sig) return false
    const payload = `${kind}|${nonce}|${exp}`
    const expected = createHmac('sha256', stateSecret()).update(payload).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false
    if (Date.now() > Number(exp)) return false
    return true
  } catch {
    return false
  }
}

export function buildGoogleLoginUrl(): string {
  const client = getGoogleLoginOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state: createGoogleLoginState(),
  })
}

export async function exchangeGoogleLoginCode(code: string): Promise<{
  email: string
  name: string
  picture: string | null
}> {
  const client = getGoogleLoginOAuth2Client()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data } = await oauth2.userinfo.get()
  const email = (data.email || '').trim().toLowerCase()
  if (!email) throw new Error('Google no devolvió email')
  return {
    email,
    name: data.name || email.split('@')[0] || 'Admin',
    picture: data.picture || null,
  }
}

/** Sesión admin CRM a partir de un email allowlist de Google. */
export function authUserFromGoogleAdmin(email: string, name: string): AuthUser {
  return {
    id: 0,
    email: email.trim().toLowerCase(),
    name: name || 'Administrador',
    role: 'admin',
  }
}

export type GoogleLoginResult = { user: AuthUser } | { error: string }

/**
 * Quién entra con este Google:
 * 1) un admin (socio) dado de alta en Usuarios con este correo → entra con su
 *    propio usuario;
 * 2) la cuenta de la agencia → administrador general, como hasta ahora;
 * 3) un usuario del equipo (developer, PM, comercial) → no: entra con contraseña;
 * 4) cualquier otro correo → no entra.
 */
export async function resolveGoogleLoginUser(email: string, name: string): Promise<GoogleLoginResult> {
  const normalized = email.trim().toLowerCase()
  const crmUser = await findCrmUserByEmail(normalized)
  if (crmUser?.role === 'admin') {
    return {
      user: {
        id: crmUser.id,
        email: crmUser.email.trim().toLowerCase(),
        name: crmUser.name || name || normalized,
        role: 'admin' as CrmRole,
      },
    }
  }
  if (isAgencyGoogleEmail(normalized)) return { user: authUserFromGoogleAdmin(normalized, name) }
  if (crmUser) {
    return { error: 'Con Google solo entran los administradores. Entra con tu email y contraseña.' }
  }
  return { error: 'Este correo de Google no tiene acceso al CRM Buffalo.' }
}
