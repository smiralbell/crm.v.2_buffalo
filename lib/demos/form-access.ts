import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'demo_form_auth'
const SESSION_HOURS = 24

function appSecret(): string {
  const s =
    process.env.FORM_ACCESS_SECRET ||
    process.env.CRM_ADMIN_PASSWORD ||
    process.env.RETELL_API_KEY
  if (!s) throw new Error('Falta FORM_ACCESS_SECRET o credencial de app para firmar sesiones')
  return s
}

export function generatePublicFormToken(): string {
  return randomBytes(24).toString('base64url')
}

export function hashFormPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyFormPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = scryptSync(password, salt, 64).toString('hex')
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'))
  } catch {
    return false
  }
}

export function buildPublicFormUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (base) return `${base}/formulario/${token}`
  return `/formulario/${token}`
}

export function signFormSession(token: string, demoId: number): string {
  const exp = Date.now() + SESSION_HOURS * 3600_000
  const payload = `${demoId}:${token}:${exp}`
  const sig = createHmac('sha256', appSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyFormSession(cookieValue: string | undefined, token: string): number | null {
  if (!cookieValue) return null
  try {
    const decoded = Buffer.from(cookieValue, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 4) return null
    const [demoIdStr, tok, expStr, sig] = parts
    if (tok !== token) return null
    const exp = Number(expStr)
    if (!Number.isFinite(exp) || Date.now() > exp) return null
    const payload = `${demoIdStr}:${tok}:${expStr}`
    const expected = createHmac('sha256', appSecret()).update(payload).digest('hex')
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const demoId = parseInt(demoIdStr, 10)
    return Number.isFinite(demoId) ? demoId : null
  } catch {
    return null
  }
}

export function formSessionCookieHeader(token: string, demoId: number): string {
  const value = signFormSession(token, demoId)
  const maxAge = SESSION_HOURS * 3600
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

export function readFormSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export { COOKIE_NAME }
