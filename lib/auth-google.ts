import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import { google } from 'googleapis'
import type { AuthUser } from '@/lib/auth'

const DEFAULT_ADMIN_EMAILS = [
  'agenciabuffaloo@gmail.com',
  'smiralbell@gmail.com',
]

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

export function getGoogleAdminAllowlist(): string[] {
  const fromEnv = (process.env.GOOGLE_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (fromEnv.length > 0) return fromEnv
  return DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase())
}

export function isGoogleAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return getGoogleAdminAllowlist().includes(email.trim().toLowerCase())
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
