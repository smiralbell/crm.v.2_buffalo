/**
 * Tokens Bearer de webhooks (Instantly, tickets, n8n, onboarding…).
 * Comparación en tiempo constante; el valor por defecto legado se acepta
 * si la variable no está en EasyPanel, para no cortar integraciones ya pegadas.
 */
import { createHash, timingSafeEqual } from 'crypto'
import type { NextApiRequest } from 'next'

export function readBearer(req: NextApiRequest): string {
  const header = req.headers.authorization || ''
  return header.replace(/^Bearer\s+/i, '').trim()
}

export function secretsEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function bearerMatches(req: NextApiRequest, expected: string | null | undefined): boolean {
  const exp = expected?.trim()
  if (!exp) return false
  return secretsEqual(readBearer(req), exp)
}

export function envSecret(name: string, legacyDefault?: string): string | null {
  const v = process.env[name]?.trim()
  if (v) return v
  return legacyDefault?.trim() || null
}

export function usesLegacyWebhookToken(name: string): boolean {
  return !process.env[name]?.trim()
}
