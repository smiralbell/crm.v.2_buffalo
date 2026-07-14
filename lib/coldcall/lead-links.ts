import type { ColumnMapping } from '@/lib/coldcall/field-mapping'

export interface LeadLinkSource {
  web?: string | null
  linkedin?: string | null
  empresa?: string | null
  raw_data?: Record<string, string>
}

function pickFromRaw(
  raw: Record<string, string> | undefined,
  patterns: RegExp[]
): string | null {
  if (!raw) return null
  for (const [key, val] of Object.entries(raw)) {
    const k = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (patterns.some((p) => p.test(k)) && val?.trim()) return val.trim()
  }
  return null
}

export function normalizeExternalUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  let s = url.trim().replace(/^['"`]+|['"`]+$/g, '')
  if (!s || s === '—' || s === '-') return null
  if (!/^https?:\/\//i.test(s)) {
    if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) s = `https://${s}`
    else return null
  }
  try {
    return new URL(s).href
  } catch {
    return null
  }
}

export function resolveLeadWeb(
  lead: LeadLinkSource,
  columnMapping?: ColumnMapping | null
): string | null {
  const fromDb = normalizeExternalUrl(lead.web)
  if (fromDb) return fromDb

  const mapped = columnMapping?.web
  if (mapped && lead.raw_data?.[mapped]?.trim()) {
    return normalizeExternalUrl(lead.raw_data[mapped])
  }

  return normalizeExternalUrl(
    pickFromRaw(lead.raw_data, [/web|website|sitio|url|pagina|página|domain|dominio/])
  )
}

export function resolveLeadLinkedIn(
  lead: LeadLinkSource,
  columnMapping?: ColumnMapping | null
): string | null {
  const fromDb = normalizeExternalUrl(lead.linkedin)
  if (fromDb) return fromDb

  const mapped = columnMapping?.linkedin
  if (mapped && lead.raw_data?.[mapped]?.trim()) {
    return normalizeExternalUrl(lead.raw_data[mapped])
  }

  const raw = pickFromRaw(lead.raw_data, [/linkedin/])
  if (!raw) return null
  if (raw.includes('linkedin.com')) return normalizeExternalUrl(raw)
  return normalizeExternalUrl(`https://linkedin.com/in/${raw.replace(/^\/+/, '')}`)
}

export function telHref(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null
  const digits = phone.replace(/[^\d+]/g, '')
  if (digits.length < 9) return null
  return `tel:${digits.startsWith('+') ? digits : `+${digits.replace(/^\+/, '')}`}`
}
