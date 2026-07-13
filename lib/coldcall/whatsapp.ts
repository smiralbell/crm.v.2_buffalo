import type { ColumnMapping } from '@/lib/coldcall/field-mapping'

/** Quita comillas, espacios y se queda con el primer número si hay varios. */
export function cleanPhoneRaw(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null

  let s = phone.trim()
  s = s.replace(/^['"`]+|['"`]+$/g, '').trim()
  s = s.split(/\s*[/|;|,]\s*|\s+o\s+|\s+or\s+/i)[0]?.trim() || ''
  s = s.replace(/\(0\)/g, '')

  return s || null
}

/** Normaliza a dígitos internacionales para wa.me / WhatsApp Web (sin +). */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  const cleaned = cleanPhoneRaw(phone)
  if (!cleaned) return null

  let digitsSource = cleaned

  const compact = cleaned.replace(/\s/g, '')
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(compact)) {
    const n = Number(compact)
    if (Number.isFinite(n) && n > 0) {
      digitsSource = String(Math.round(n))
    }
  }

  let digits = digitsSource.replace(/\D/g, '')
  if (digits.length < 9) return null

  if (digits.startsWith('00')) digits = digits.slice(2)

  // España: móvil/fijo de 9 dígitos sin prefijo
  if (digits.length === 9 && /^[6789]/.test(digits)) {
    digits = `34${digits}`
  } else if (!digits.startsWith('34') && digits.length <= 9) {
    digits = `34${digits}`
  }

  if (digits.length < 10 || digits.length > 15) return null

  return digits
}

export function formatPhoneForDisplay(phone: string | null | undefined): string | null {
  const normalized = normalizeWhatsAppPhone(phone)
  if (!normalized) return cleanPhoneRaw(phone)

  if (normalized.startsWith('34') && normalized.length === 11) {
    const rest = normalized.slice(2)
    return `+34 ${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)} ${rest.slice(9)}`
  }

  return `+${normalized}`
}

export interface LeadPhoneSource {
  telefono?: string | null
  raw_data?: Record<string, string>
}

/** Teléfono del lead: columna DB, mapeo CSV o búsqueda en raw_data. */
export function resolveLeadPhone(
  lead: LeadPhoneSource,
  columnMapping?: ColumnMapping | null
): string | null {
  const candidates: string[] = []

  if (lead.telefono?.trim()) candidates.push(lead.telefono.trim())

  const telefonoCol = columnMapping?.telefono
  if (telefonoCol && lead.raw_data?.[telefonoCol]?.trim()) {
    candidates.push(lead.raw_data[telefonoCol].trim())
  }

  for (const [key, val] of Object.entries(lead.raw_data || {})) {
    const k = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (/telefono|tel|phone|movil|mobile|celular/.test(k) && val?.trim()) {
      candidates.push(val.trim())
    }
  }

  for (const candidate of candidates) {
    if (normalizeWhatsAppPhone(candidate)) return candidate
  }

  return candidates[0] || null
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone)
  if (!normalized) return null
  const text = encodeURIComponent(message.trim())
  return `https://web.whatsapp.com/send?phone=${normalized}&text=${text}`
}

function firstName(nombre: string, firstName?: string | null): string {
  if (firstName?.trim()) return firstName.trim()
  return nombre.trim().split(/\s+/)[0] || nombre.trim()
}

export type WhatsAppTemplateKind = 'interesado' | 'no_interesado'

export function defaultWhatsAppTemplate(
  kind: WhatsAppTemplateKind,
  lead: { nombre: string; first_name?: string | null; empresa?: string | null }
): string {
  const name = firstName(lead.nombre, lead.first_name)
  const empresa = lead.empresa?.trim()

  if (kind === 'interesado') {
    return [
      `Hola ${name},`,
      '',
      'Gracias por tu tiempo en la llamada de hoy.',
      empresa
        ? `Como comentamos, en Buffalo ayudamos a empresas como ${empresa} con soluciones de IA y automatización.`
        : 'Como comentamos, en Buffalo ayudamos a empresas con soluciones de IA y automatización.',
      '',
      'Te comparto la información y, si te encaja, podemos agendar una breve reunión esta semana.',
      '',
      'Un saludo.',
    ].join('\n')
  }

  return [
    `Hola ${name},`,
    '',
    'Gracias por atendernos hoy.',
    'Quedamos a tu disposición por si en el futuro necesitáis apoyo.',
    '',
    'Un saludo.',
  ].join('\n')
}

export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false

  const url = buildWhatsAppUrl(phone, trimmed)
  if (!url) return false

  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
