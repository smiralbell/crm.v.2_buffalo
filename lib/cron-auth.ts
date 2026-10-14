import type { NextApiRequest } from 'next'
import { createHash, timingSafeEqual } from 'crypto'

export function isCronSecretConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim())
}

/**
 * Endpoints de cron: `Authorization: Bearer <CRON_SECRET>` (preferido) o `?secret=<CRON_SECRET>`.
 * Comparación en tiempo constante.
 */
export function isCronAuthorized(req: NextApiRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret.trim() : ''
  const provided = bearer || querySecret
  if (!provided) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
