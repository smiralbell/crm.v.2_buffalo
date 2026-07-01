import { normalizePhoneNumber } from './phone'

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** Variantes españolas comunes para comparar números */
export function phoneMatchVariants(phone: string): string[] {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return []

  const variants = new Set<string>([normalized])
  const digits = phoneDigits(normalized)

  if (normalized.startsWith('+34') && digits.length >= 11) {
    variants.add(`+${digits.slice(2)}`)
    variants.add(digits.slice(2))
  }

  if (digits.length === 9 && /^[67]/.test(digits)) {
    variants.add(`+34${digits}`)
    variants.add(`+${digits}`)
  }

  variants.add(digits)
  return Array.from(variants)
}

/** Encuentra el número autorizado en la demo que coincide con el destino indicado */
export function matchAuthorizedDemoPhone(
  authorized: string[],
  rawDestino: string
): string | null {
  const trimmed = rawDestino.trim()
  if (!trimmed) return null

  if (authorized.includes(trimmed)) return trimmed

  const destVariants = new Set(phoneMatchVariants(trimmed))
  const destDigits = phoneDigits(trimmed)

  for (const auth of authorized) {
    if (auth === trimmed) return auth
    const authVariants = phoneMatchVariants(auth)
    for (const v of authVariants) {
      if (destVariants.has(v)) return auth
    }
    if (phoneDigits(auth) === destDigits) return auth
  }

  const normalized = normalizePhoneNumber(trimmed)
  if (normalized && authorized.includes(normalized)) return normalized

  return null
}

export function normalizeRetellE164(raw: string): string {
  const cleaned = raw.trim().replace(/[.\s]+$/g, '')
  const normalized = normalizePhoneNumber(cleaned)
  if (!normalized) {
    throw new Error(`Número inválido: ${raw}`)
  }
  return normalized
}
