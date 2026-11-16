/** Normaliza a formato internacional +XXXXXXXXXXX */
export function normalizePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let digits = trimmed.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '')
  } else {
    digits = digits.replace(/\D/g, '')
    if (!digits) return null
    digits = `+${digits}`
  }

  if (digits.length < 8 || digits.length > 16) return null
  return digits
}

/** WhatsApp manda el número sin +; lo añadimos para comparar con la BD */
export function normalizeWhatsAppPhone(raw: string): string | null {
  const cleaned = raw.replace(/@.*$/, '').replace(/\D/g, '')
  if (!cleaned) return null
  return normalizePhoneNumber(`+${cleaned}`)
}
