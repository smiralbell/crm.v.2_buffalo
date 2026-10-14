import { toE164 } from '@/lib/identity/normalize'

/**
 * Normaliza a formato internacional +XXXXXXXXXXX.
 * Usa el normalizador común (lib/identity): un móvil español sin prefijo pasa a +34.
 */
export function normalizePhoneNumber(raw: string): string | null {
  return toE164(raw)
}

/** Wasender suele enviar números sin +; lo añadimos para comparar con la BD */
export function normalizeWasenderPhone(raw: string): string | null {
  const cleaned = raw.replace(/@.*$/, '').replace(/\D/g, '')
  if (!cleaned) return null
  return normalizePhoneNumber(`+${cleaned}`)
}

/** Para enviar por Wasender: dígitos sin + */
export function phoneToWasenderRecipient(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** JID de WhatsApp para presence (escribiendo…) */
export function phoneToWasenderJid(phone: string): string {
  return `${phoneToWasenderRecipient(phone)}@s.whatsapp.net`
}
