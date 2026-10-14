/**
 * Identidad única del contacto: una sola forma de normalizar teléfono y email
 * para todo el CRM (demos, cold calling, formularios web, Fireflies…).
 */

/** Prefijo por defecto para números nacionales sin prefijo (España). */
const DEFAULT_COUNTRY = '34'

/**
 * Teléfono → E.164 (+XXXXXXXXXXX).
 * - «00» inicial se trata como «+».
 * - 9 dígitos españoles (6/7/8/9…) sin prefijo → +34.
 * - Resto: se respeta el prefijo que venga.
 */
export function toE164(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  let digits: string
  if (trimmed.startsWith('+')) {
    digits = trimmed.slice(1).replace(/\D/g, '')
  } else {
    digits = trimmed.replace(/\D/g, '')
    if (!digits) return null
    if (digits.startsWith('00')) digits = digits.slice(2)
    else if (digits.length === 9 && /^[6789]/.test(digits)) digits = DEFAULT_COUNTRY + digits
  }

  if (digits.length < 7 || digits.length > 15) return null
  return `+${digits}`
}

/**
 * Clave de comparación por teléfono: solo dígitos, con prefijo de país (sin «+»).
 * Mismo criterio que usaba cold calling para detectar duplicados.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 9 && /^[6789]/.test(digits)) digits = DEFAULT_COUNTRY + digits
  if (digits.length < 9) return null
  return digits
}

/** Últimos 9 dígitos: empareja «612 34 56 78», «+34612345678» y «0034612345678». */
export function phoneTail(raw: string | null | undefined): string | null {
  const key = phoneKey(raw)
  return key ? key.slice(-9) : null
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a)
  const kb = phoneKey(b)
  if (!ka || !kb) return false
  return ka === kb || ka.slice(-9) === kb.slice(-9)
}

/** Email normalizado (minúsculas, sin espacios). Devuelve null si no parece un email. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? '').trim().toLowerCase()
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  return e
}
