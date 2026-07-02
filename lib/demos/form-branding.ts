import type { CSSProperties } from 'react'

export type FormFontId =
  | 'system'
  | 'inter'
  | 'poppins'
  | 'dm-sans'
  | 'playfair'
  | 'roboto'
  | 'montserrat'

export const FORM_FONT_OPTIONS: Array<{
  id: FormFontId
  label: string
  family: string
  google?: string
}> = [
  {
    id: 'system',
    label: 'Sistema',
    family:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: 'inter',
    label: 'Inter',
    family: '"Inter", sans-serif',
    google: 'Inter:wght@400;600',
  },
  {
    id: 'poppins',
    label: 'Poppins',
    family: '"Poppins", sans-serif',
    google: 'Poppins:wght@400;600',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    family: '"DM Sans", sans-serif',
    google: 'DM+Sans:wght@400;600',
  },
  {
    id: 'roboto',
    label: 'Roboto',
    family: '"Roboto", sans-serif',
    google: 'Roboto:wght@400;500;700',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    family: '"Montserrat", sans-serif',
    google: 'Montserrat:wght@400;600',
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    family: '"Playfair Display", serif',
    google: 'Playfair+Display:wght@400;600',
  },
]

export interface OutboundFormBranding {
  logo_url: string | null
  /** Fondo del formulario */
  color_primary: string
  /** Color de textos y etiquetas */
  color_text: string
  /** Botones y acentos */
  color_secondary: string
  font_id: FormFontId
}

export const DEFAULT_OUTBOUND_FORM_BRANDING: OutboundFormBranding = {
  logo_url: null,
  color_primary: '#f5f3ff',
  color_text: '#111827',
  color_secondary: '#6d28d9',
  font_id: 'system',
}

const HEX_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/

const FONT_IDS = new Set(FORM_FONT_OPTIONS.map((f) => f.id))

export function normalizeFormFontId(raw: unknown): FormFontId {
  if (typeof raw === 'string' && FONT_IDS.has(raw as FormFontId)) {
    return raw as FormFontId
  }
  return 'system'
}

export function resolveFormFontFamily(fontId: FormFontId): string {
  return FORM_FONT_OPTIONS.find((f) => f.id === fontId)?.family ?? FORM_FONT_OPTIONS[0].family
}

export function googleFontsHref(fontId: FormFontId): string | null {
  const opt = FORM_FONT_OPTIONS.find((f) => f.id === fontId)
  if (!opt?.google) return null
  return `https://fonts.googleapis.com/css2?family=${opt.google}&display=swap`
}

/** Acepta cualquier URL http(s) de imagen, incl. enlaces firmados con query string */
export function normalizeLogoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return trimmed
  } catch {
    return null
  }
}

export function normalizeHexColor(raw: string, fallback: string): string {
  const trimmed = raw.trim()
  if (!HEX_RE.test(trimmed)) return fallback
  if (trimmed.length === 4) {
    const r = trimmed[1]
    const g = trimmed[2]
    const b = trimmed[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return trimmed.toLowerCase()
}

export function normalizeOutboundFormBranding(raw: unknown): OutboundFormBranding {
  const def = DEFAULT_OUTBOUND_FORM_BRANDING
  if (!raw || typeof raw !== 'object') return { ...def }

  const row = raw as Record<string, unknown>
  const logo = normalizeLogoUrl(row.logo_url)
  const font_id = normalizeFormFontId(row.font_id)

  const hasTextColor =
    typeof row.color_text === 'string' && HEX_RE.test(row.color_text.trim())

  if (!hasTextColor) {
    const legacyButton = normalizeHexColor(
      typeof row.color_primary === 'string' ? row.color_primary : def.color_secondary,
      def.color_secondary
    )
    const legacyBg = normalizeHexColor(
      typeof row.color_secondary === 'string' ? row.color_secondary : def.color_primary,
      def.color_primary
    )
    return {
      logo_url: logo,
      color_primary: legacyBg,
      color_text: def.color_text,
      color_secondary: legacyButton,
      font_id,
    }
  }

  return {
    logo_url: logo,
    color_primary: normalizeHexColor(
      typeof row.color_primary === 'string' ? row.color_primary : def.color_primary,
      def.color_primary
    ),
    color_text: normalizeHexColor(
      typeof row.color_text === 'string' ? row.color_text : def.color_text,
      def.color_text
    ),
    color_secondary: normalizeHexColor(
      typeof row.color_secondary === 'string' ? row.color_secondary : def.color_secondary,
      def.color_secondary
    ),
    font_id,
  }
}

/** Oscurece un color hex para hover de botones */
export function darkenHexColor(hex: string, amount = 18): string {
  const n = normalizeHexColor(hex, '#000000').slice(1)
  const num = parseInt(n, 16)
  const r = Math.max(0, (num >> 16) - amount)
  const g = Math.max(0, ((num >> 8) & 0xff) - amount)
  const b = Math.max(0, (num & 0xff) - amount)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function brandingToCssVars(branding: OutboundFormBranding): CSSProperties {
  return {
    ['--form-bg' as string]: branding.color_primary,
    ['--form-text' as string]: branding.color_text,
    ['--form-accent' as string]: branding.color_secondary,
    ['--form-accent-hover' as string]: darkenHexColor(branding.color_secondary),
    fontFamily: resolveFormFontFamily(branding.font_id),
  }
}
