export interface OutboundFormBranding {
  logo_url: string | null
  color_primary: string
  color_secondary: string
}

export const DEFAULT_OUTBOUND_FORM_BRANDING: OutboundFormBranding = {
  logo_url: null,
  color_primary: '#6d28d9',
  color_secondary: '#ede9fe',
}

const HEX_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/

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
  const logo =
    typeof row.logo_url === 'string' && row.logo_url.trim() ? row.logo_url.trim() : null

  return {
    logo_url: logo,
    color_primary: normalizeHexColor(
      typeof row.color_primary === 'string' ? row.color_primary : def.color_primary,
      def.color_primary
    ),
    color_secondary: normalizeHexColor(
      typeof row.color_secondary === 'string' ? row.color_secondary : def.color_secondary,
      def.color_secondary
    ),
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

import type { CSSProperties } from 'react'

export function brandingToCssVars(branding: OutboundFormBranding): CSSProperties {
  return {
    ['--form-primary' as string]: branding.color_primary,
    ['--form-primary-hover' as string]: darkenHexColor(branding.color_primary),
    ['--form-secondary' as string]: branding.color_secondary,
  }
}