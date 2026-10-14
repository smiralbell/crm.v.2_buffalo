import { createHmac, timingSafeEqual } from 'crypto'
import { getMetaPageConfig } from '@/lib/integrations/meta/config'

export type MetaVerifyResult =
  | { ok: true; challenge: string }
  | { ok: false; status: number; error: string }

export function verifyMetaSubscription(
  query: Record<string, string | string[] | undefined>,
  cfg = getMetaPageConfig()
): MetaVerifyResult {
  const mode = String(query['hub.mode'] ?? query.hub_mode ?? '').trim()
  const token = String(query['hub.verify_token'] ?? query.hub_verify_token ?? '').trim()
  const challenge = String(query['hub.challenge'] ?? query.hub_challenge ?? '')

  if (!cfg.verifyToken) {
    return { ok: false, status: 503, error: 'META_VERIFY_TOKEN no configurado' }
  }
  if (mode !== 'subscribe') {
    return { ok: false, status: 400, error: 'hub.mode inválido' }
  }
  if (!token || token !== cfg.verifyToken) {
    return { ok: false, status: 403, error: 'verify_token inválido' }
  }
  if (!challenge) {
    return { ok: false, status: 400, error: 'Falta hub.challenge' }
  }
  return { ok: true, challenge }
}

function signatureBytes(header: string): Buffer | null {
  let value = header.trim()
  if (value.toLowerCase().startsWith('sha256=')) value = value.slice(7)
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null
  return Buffer.from(value, 'hex')
}

/** HMAC-SHA256 del body original con META_APP_SECRET. Header `X-Hub-Signature-256`. */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret = getMetaPageConfig().appSecret
): boolean {
  if (!secret) return false
  if (!signatureHeader?.trim()) return false
  const received = signatureBytes(signatureHeader)
  if (!received) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  if (received.length !== expected.length) return false
  try {
    return timingSafeEqual(received, expected)
  } catch {
    return false
  }
}

export function signMetaBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`
}
