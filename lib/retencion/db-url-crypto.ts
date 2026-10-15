import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

/**
 * Clave de cifrado de URLs de Postgres de clientes.
 * Preferir CLIENT_DB_ENCRYPTION_KEY en EasyPanel. Si no está, se reutiliza
 * SESSION_SECRET / GOOGLE_TOKEN_ENCRYPTION_KEY para no romper URLs ya guardadas.
 */
function encryptionKey(): Buffer {
  const secret = (
    process.env.CLIENT_DB_ENCRYPTION_KEY ||
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    'default-secret-change-in-production'
  ).trim()
  return createHash('sha256').update(secret).digest()
}

export function encryptDbUrl(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plain.trim(), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptDbUrl(enc: string): string {
  try {
    const buf = Buffer.from(enc, 'base64')
    if (buf.length < 28) throw new Error('URL cifrada inválida')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = createDecipheriv(ALGO, encryptionKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('No se pudo leer la URL cifrada. Vuelve a pegar la URL y conectar.')
  }
}

export function maskDbUrl(url: string): { host: string | null; database: string | null } {
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, 'http:'))
    const port = u.port || '5432'
    return {
      host: u.hostname ? `${u.hostname}:${port}` : null,
      database: u.pathname?.replace(/^\//, '').split('?')[0] || null,
    }
  } catch {
    return { host: null, database: null }
  }
}
