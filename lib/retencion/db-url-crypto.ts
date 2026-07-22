import { encryptSecret, decryptSecret } from '@/lib/integrations/google/crypto'

/** Reutiliza la misma clave de cifrado que Google (SESSION_SECRET / GOOGLE_TOKEN_ENCRYPTION_KEY). */
export function encryptDbUrl(plain: string): string {
  return encryptSecret(plain.trim())
}

export function decryptDbUrl(enc: string): string {
  return decryptSecret(enc)
}

export function maskDbUrl(url: string): { host: string | null; database: string | null } {
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, 'http:'))
    return {
      host: u.hostname || null,
      database: u.pathname?.replace(/^\//, '') || null,
    }
  } catch {
    return { host: null, database: null }
  }
}
