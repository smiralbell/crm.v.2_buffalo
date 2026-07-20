import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import { google } from 'googleapis'
import type { AuthUser } from '@/lib/auth'
import { googleOwnerKey } from '@/lib/integrations/google/owner'

export const GOOGLE_CALENDAR_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly'

export function getGoogleRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    'https://n8n-crmv2-buffalo.zedf6b.easypanel.host/api/integrations/google/callback'
  )
}

export function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben estar configurados')
  }
  return new google.auth.OAuth2(clientId, clientSecret, getGoogleRedirectUri())
}

function stateSecret(): string {
  return process.env.SESSION_SECRET || 'default-secret-change-in-production'
}

/** state firmado: ownerKey|nonce|exp|sig */
export function createOAuthState(user: AuthUser): string {
  const ownerKey = googleOwnerKey(user)
  const nonce = randomBytes(8).toString('hex')
  const exp = String(Date.now() + 15 * 60 * 1000)
  const payload = `${ownerKey}|${nonce}|${exp}`
  const sig = createHmac('sha256', stateSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}|${sig}`).toString('base64url')
}

export function parseOAuthState(state: string): { ownerKey: string } | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const parts = decoded.split('|')
    if (parts.length !== 4) return null
    const [ownerKey, nonce, exp, sig] = parts
    if (!ownerKey || !nonce || !exp || !sig) return null
    const payload = `${ownerKey}|${nonce}|${exp}`
    const expected = createHmac('sha256', stateSecret()).update(payload).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    if (Date.now() > Number(exp)) return null
    return { ownerKey }
  } catch {
    return null
  }
}

export function buildGoogleConnectUrl(user: AuthUser): string {
  const client = getGoogleOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [GOOGLE_CALENDAR_READONLY_SCOPE, 'openid', 'email', 'profile'],
    state: createOAuthState(user),
  })
}
