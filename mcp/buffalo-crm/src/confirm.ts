/**
 * Tokens de doble confirmación para borrados / operaciones destructivas.
 * Flujo:
 *  1) confirm_step=1 → genera token + preview (NO ejecuta)
 *  2) confirm_step=2 + confirm_token + confirm=true → ejecuta
 */
import crypto from 'crypto'

export type PendingConfirm = {
  token: string
  action: string
  fingerprint: string
  preview: unknown
  createdAt: number
  expiresAt: number
}

const store = new Map<string, PendingConfirm>()
const TTL_MS = 10 * 60 * 1000 // 10 minutos

function prune(): void {
  const now = Date.now()
  for (const [k, v] of Array.from(store.entries())) {
    if (v.expiresAt < now) store.delete(k)
  }
}

export function fingerprintPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
}

/** Paso 1: crea token. No ejecuta nada. */
export function issueConfirmToken(action: string, payload: unknown, preview: unknown): PendingConfirm {
  prune()
  const token = `cfm_${crypto.randomBytes(16).toString('hex')}`
  const pending: PendingConfirm = {
    token,
    action,
    fingerprint: fingerprintPayload(payload),
    preview,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  }
  store.set(token, pending)
  return pending
}

/**
 * Paso 2: valida token + fingerprint + confirm=true.
 * Devuelve error string o null si OK (y consume el token).
 */
export function consumeConfirmToken(input: {
  action: string
  token: string
  payload: unknown
  confirm: boolean
}): string | null {
  prune()
  if (!input.confirm) {
    return 'Falta confirm=true en el paso 2 de confirmación.'
  }
  if (!input.token) {
    return 'Falta confirm_token del paso 1.'
  }
  const pending = store.get(input.token)
  if (!pending) {
    return 'confirm_token inválido o caducado. Vuelve a pedir el paso 1.'
  }
  if (pending.action !== input.action) {
    return `El token es para acción "${pending.action}", no "${input.action}".`
  }
  const fp = fingerprintPayload(input.payload)
  if (fp !== pending.fingerprint) {
    return 'Los parámetros no coinciden con el preview del paso 1. No se ejecuta.'
  }
  store.delete(input.token)
  return null
}

export function confirmStep1Response(pending: PendingConfirm) {
  return {
    needs_double_confirmation: true,
    confirm_step: 1,
    confirm_token: pending.token,
    expires_in_seconds: Math.round((pending.expiresAt - Date.now()) / 1000),
    message:
      'PASO 1 OK. Revisa el preview. Para ejecutar de verdad, vuelve a llamar la MISMA tool con confirm_step=2, confirm=true y el confirm_token recibido. Sin eso NO se borra nada.',
    preview: pending.preview,
  }
}
