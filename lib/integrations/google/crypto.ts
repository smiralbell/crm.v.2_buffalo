import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function encryptionKey(): Buffer {
  const secret =
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    'default-secret-change-in-production'
  return createHash('sha256').update(secret).digest()
}

/** Cifra un string → base64(iv:tag:ciphertext) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(payload: string): string {
  try {
    const buf = Buffer.from(payload, 'base64')
    if (buf.length < 28) throw new Error('Token cifrado inválido')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = createDecipheriv(ALGO, encryptionKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Clave distinta (SESSION_SECRET / GOOGLE_TOKEN_ENCRYPTION_KEY) o payload corrupto
    if (
      msg.includes('Unsupported state') ||
      msg.includes('unable to authenticate') ||
      msg.includes('auth') ||
      msg.includes('bad decrypt') ||
      msg.includes('Token cifrado')
    ) {
      throw new Error(
        'Tokens de Google ilegibles: cambió la clave de cifrado (SESSION_SECRET). Desconecta y vuelve a conectar el calendario.'
      )
    }
    throw e
  }
}
