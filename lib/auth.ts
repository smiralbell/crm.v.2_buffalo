import { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from 'next'
import { randomBytes, createHmac, timingSafeEqual } from 'crypto'

/**
 * Obtiene las credenciales del admin desde variables de entorno
 */
function getAdminCredentials(): { email: string; password: string } {
  const email = process.env.CRM_ADMIN_EMAIL
  const password = process.env.CRM_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('CRM_ADMIN_EMAIL y CRM_ADMIN_PASSWORD deben estar configurados en .env')
  }

  return { email, password }
}

/**
 * Crea un token de sesión firmado con timestamp de expiración
 */
function createSignedSessionToken(expiresAt: Date): string {
  // Token contiene: base64(email|timestamp_expiración)
  const { email } = getAdminCredentials()
  const expiresTimestamp = expiresAt.getTime()
  const tokenData = `${email}|${expiresTimestamp}`
  const token = Buffer.from(tokenData).toString('base64')
  return signToken(token)
}

/**
 * Firma un token con el SESSION_SECRET
 */
function signToken(token: string): string {
  // Validar que SESSION_SECRET esté configurado en producción
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET debe estar configurado en producción')
  }
  
  const secret = process.env.SESSION_SECRET || 'default-secret-change-in-production'
  const hmac = createHmac('sha256', secret)
  hmac.update(token)
  const signature = hmac.digest('hex')
  return `${token}.${signature}`
}

/**
 * Verifica y extrae el token de una cookie firmada
 */
function verifyToken(signedToken: string): { valid: boolean; token?: string } {
  try {
    const parts = signedToken.split('.')
    if (parts.length !== 2) return { valid: false }

    const [token, signature] = parts
    if (!token || !signature) return { valid: false }

    const secret = process.env.SESSION_SECRET || 'default-secret-change-in-production'
    const hmac = createHmac('sha256', secret)
    hmac.update(token)
    const expectedSignature = hmac.digest('hex')

    // Usar timingSafeEqual para prevenir timing attacks
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')
    const receivedBuffer = Buffer.from(signature, 'hex')

    if (expectedBuffer.length !== receivedBuffer.length) {
      return { valid: false }
    }

    const isValid = timingSafeEqual(expectedBuffer, receivedBuffer)
    
    if (!isValid) return { valid: false }
    
    return { valid: true, token }
  } catch {
    return { valid: false }
  }
}

/**
 * Extrae información de la sesión del token (email y expiración)
 * El token contiene: base64(email|timestamp_expiración)
 */
function decodeSessionToken(token: string): { email: string; expiresAt: Date } | null {
  try {
    // Decodificar el token base64
    const tokenData = Buffer.from(token, 'base64').toString('utf-8')
    const [email, expiresTimestamp] = tokenData.split('|')
    
    if (!email || !expiresTimestamp) {
      return null
    }
    
    const expiresAt = new Date(parseInt(expiresTimestamp, 10))
    
    // Verificar que la fecha de expiración sea válida
    if (isNaN(expiresAt.getTime())) {
      return null
    }
    
    // Verificar que el email coincida con las credenciales configuradas
    const { email: configEmail } = getAdminCredentials()
    if (email !== configEmail) {
      return null
    }
    
    return { email, expiresAt }
  } catch {
    return null
  }
}

/**
 * Requiere autenticación en páginas (getServerSideProps)
 * Si no hay sesión válida, redirige a /login
 */
export async function requireAuth(
  context: GetServerSidePropsContext
): Promise<{ id: number; email: string }> {
  const signedToken = context.req.cookies.session_id

  if (!signedToken) {
    context.res.writeHead(302, { Location: '/login' })
    context.res.end()
    throw new Error('No session')
  }

  const verification = verifyToken(signedToken)
  
  if (!verification.valid || !verification.token) {
    context.res.writeHead(302, { Location: '/login' })
    context.res.end()
    throw new Error('Invalid token')
  }

  const sessionData = decodeSessionToken(verification.token)
  
  if (!sessionData) {
    context.res.writeHead(302, { Location: '/login' })
    context.res.end()
    throw new Error('Invalid session data')
  }

  // Verificar expiración real
  const now = new Date()
  if (sessionData.expiresAt < now) {
    context.res.writeHead(302, { Location: '/login' })
    context.res.end()
    throw new Error('Session expired')
  }

  const { email } = getAdminCredentials()

  return {
    id: 1, // Solo hay un usuario
    email,
  }
}

/**
 * Requiere autenticación en API routes
 * Si no hay sesión válida, retorna 401
 */
export async function requireAuthAPI(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<{ id: number; email: string }> {
  const signedToken = req.cookies.session_id

  if (!signedToken) {
    res.status(401).json({ error: 'No session' })
    throw new Error('No session')
  }

  const verification = verifyToken(signedToken)
  
  if (!verification.valid || !verification.token) {
    res.status(401).json({ error: 'Invalid token' })
    throw new Error('Invalid token')
  }

  const sessionData = decodeSessionToken(verification.token)
  
  if (!sessionData) {
    res.status(401).json({ error: 'Invalid session data' })
    throw new Error('Invalid session data')
  }

  // Verificar expiración real
  const now = new Date()
  if (sessionData.expiresAt < now) {
    res.status(401).json({ error: 'Session expired' })
    throw new Error('Session expired')
  }

  const { email } = getAdminCredentials()

  return {
    id: 1, // Solo hay un usuario
    email,
  }
}

/**
 * Crea una nueva sesión
 */
export async function createSession(
  email: string,
  res?: NextApiResponse
): Promise<string> {
  // Crear fecha de expiración (7 días desde ahora)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)
  
  const signedToken = createSignedSessionToken(expiresAt)

  // Setear cookie si hay response object
  if (res) {
    const maxAge = 7 * 24 * 60 * 60 // 7 días en segundos
    const isProduction = process.env.NODE_ENV === 'production'
    
    res.setHeader(
      'Set-Cookie',
      `session_id=${signedToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`
    )
  }

  return signedToken
}

/**
 * Obtiene la sesión actual sin validar (para uso interno)
 */
export async function getSession(signedToken: string) {
  if (!signedToken) return null

  const verification = verifyToken(signedToken)
  if (!verification.valid || !verification.token) return null

  const sessionData = decodeSessionToken(verification.token)
  if (!sessionData) return null

  // Verificar expiración
  const now = new Date()
  if (sessionData.expiresAt < now) return null

  return sessionData
}

/**
 * Elimina una sesión
 */
export async function deleteSession(
  signedToken: string,
  res?: NextApiResponse
): Promise<void> {
  // Limpiar cookie si hay response object
  if (res) {
    res.setHeader(
      'Set-Cookie',
      'session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    )
  }
}
