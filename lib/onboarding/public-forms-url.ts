/**
 * Base URL pública de formularios (/f/...).
 * Debe ser un host distinto al CRM para que el cliente no vea ni descubra /login.
 *
 * Env:
 *   NEXT_PUBLIC_FORMS_BASE_URL=https://forms.agenciabuffalo.es
 *   FORMS_PUBLIC_HOST=forms.agenciabuffalo.es  (opcional; se infiere de la URL)
 */
export function getPublicFormsBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_FORMS_BASE_URL ||
    process.env.FORMS_BASE_URL ||
    ''
  const trimmed = raw.trim().replace(/\/$/, '')
  if (trimmed) return trimmed
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

export function getPublicFormsHost(): string | null {
  const explicit = (process.env.FORMS_PUBLIC_HOST || '').trim().toLowerCase()
  if (explicit) return explicit.replace(/:\d+$/, '')
  const base = getPublicFormsBaseUrl()
  if (!base) return null
  try {
    return new URL(base).host.toLowerCase().replace(/:\d+$/, '')
  } catch {
    return null
  }
}

export function publicFormUrl(slug: string, baseUrl?: string): string {
  const base = (baseUrl || getPublicFormsBaseUrl()).replace(/\/$/, '')
  const clean = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
  if (!base) return `/f/${clean}`
  return `${base}/f/${clean}`
}

export function isFormsOnlyHost(hostHeader: string | null | undefined): boolean {
  const formsHost = getPublicFormsHost()
  if (!formsHost || !hostHeader) return false
  const host = hostHeader.split(':')[0]?.toLowerCase() || ''
  return host === formsHost
}
