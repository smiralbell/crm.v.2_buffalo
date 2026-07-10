import { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from 'next'
import { randomBytes, createHmac, timingSafeEqual } from 'crypto'
import { verifyCrmUserPassword } from '@/lib/crm-users'

export type CrmRole = 'admin' | 'developer' | 'comercial'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: CrmRole
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function getAdminCredentials(): { email: string; password: string; name: string } {
  const email = process.env.CRM_ADMIN_EMAIL
  const password = process.env.CRM_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('CRM_ADMIN_EMAIL y CRM_ADMIN_PASSWORD deben estar configurados en .env')
  }
  return { email, password, name: 'Administrador' }
}

function signToken(token: string): string {
  const secret = process.env.SESSION_SECRET || 'default-secret-change-in-production'
  const hmac = createHmac('sha256', secret)
  hmac.update(token)
  return `${token}.${hmac.digest('hex')}`
}

export function verifyToken(signedToken: string): { valid: boolean; token?: string } {
  try {
    const parts = signedToken.split('.')
    if (parts.length !== 2) return { valid: false }
    const [token, signature] = parts
    if (!token || !signature) return { valid: false }

    const secret = process.env.SESSION_SECRET || 'default-secret-change-in-production'
    const hmac = createHmac('sha256', secret)
    hmac.update(token)
    const expectedBuffer = Buffer.from(hmac.digest('hex'), 'hex')
    const receivedBuffer = Buffer.from(signature, 'hex')
    if (expectedBuffer.length !== receivedBuffer.length) return { valid: false }
    if (!timingSafeEqual(expectedBuffer, receivedBuffer)) return { valid: false }
    return { valid: true, token }
  } catch {
    return { valid: false }
  }
}

function encodeSessionPayload(user: AuthUser): string {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    exp: Date.now() + SESSION_MAX_AGE_MS,
    n: randomBytes(8).toString('hex'),
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeSessionPayload(token: string): AuthUser | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8')
    const data = JSON.parse(raw) as {
      id: number
      email: string
      name: string
      role: CrmRole
      exp: number
    }
    if (!data.email || !data.role || typeof data.exp !== 'number') return null
    if (Date.now() > data.exp) return null
    return {
      id: data.id ?? 0,
      email: data.email,
      name: data.name || data.email,
      role: data.role,
    }
  } catch {
    return null
  }
}

function getUserFromSignedToken(signedToken: string): AuthUser | null {
  const verification = verifyToken(signedToken)
  if (!verification.valid || !verification.token) return null
  return decodeSessionPayload(verification.token)
}

export async function authenticateCredentials(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const admin = getAdminCredentials()
  if (email === admin.email && password === admin.password) {
    return { id: 0, email: admin.email, name: admin.name, role: 'admin' }
  }
  const dev = await verifyCrmUserPassword(email, password)
  if (!dev) return null
  return {
    id: dev.id,
    email: dev.email,
    name: dev.name,
    role: dev.role as CrmRole,
  }
}

export async function requireAuth(
  context: GetServerSidePropsContext
): Promise<AuthUser> {
  const signedToken = context.req.cookies.session_id
  if (!signedToken) {
    context.res.writeHead(302, { Location: '/login' })
    context.res.end()
    throw new Error('No session')
  }
  const user = getUserFromSignedToken(signedToken)
  if (!user) {
    context.res.writeHead(302, { Location: '/login' })
    context.res.end()
    throw new Error('Invalid session')
  }
  return user
}

export async function requireAuthAPI(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthUser> {
  const signedToken = req.cookies.session_id
  if (!signedToken) {
    res.status(401).json({ error: 'No session' })
    throw new Error('No session')
  }
  const user = getUserFromSignedToken(signedToken)
  if (!user) {
    res.status(401).json({ error: 'Invalid session' })
    throw new Error('Invalid session')
  }
  return user
}

export async function requireAdminAPI(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthUser> {
  const user = await requireAuthAPI(req, res)
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado' })
    throw new Error('Forbidden')
  }
  return user
}

export async function requireColdCallAPI(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthUser> {
  const user = await requireAuthAPI(req, res)
  if (user.role !== 'admin' && user.role !== 'comercial') {
    res.status(403).json({ error: 'Acceso denegado' })
    throw new Error('Forbidden')
  }
  return user
}

export async function requireFreelancerInvoicesAPI(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthUser> {
  const user = await requireAuthAPI(req, res)
  if (user.role !== 'developer' && user.role !== 'comercial') {
    res.status(403).json({ error: 'Acceso denegado' })
    throw new Error('Forbidden')
  }
  return user
}

export async function createSession(user: AuthUser, res?: NextApiResponse): Promise<string> {
  const payload = encodeSessionPayload(user)
  const signedToken = signToken(payload)
  if (res) {
    const maxAge = Math.floor(SESSION_MAX_AGE_MS / 1000)
    const isProduction = process.env.NODE_ENV === 'production'
    res.setHeader(
      'Set-Cookie',
      `session_id=${signedToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`
    )
  }
  return signedToken
}

export function getSessionUser(signedToken: string | undefined): AuthUser | null {
  if (!signedToken) return null
  return getUserFromSignedToken(signedToken)
}

export async function deleteSession(_signedToken: string, res?: NextApiResponse): Promise<void> {
  if (res) {
    res.setHeader('Set-Cookie', 'session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
  }
}
