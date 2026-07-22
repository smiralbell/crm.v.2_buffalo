import type { CSSProperties } from 'react'

/** Paletas oficiales de la plantilla de informe Buffalo. */
export const BUFFALO_PALETTES = {
  light: {
    bg: '#ffffff',
    surface: '#eef7f4',
    surface2: '#e3f1ec',
    text: '#17211e',
    muted: '#56655f',
    heading: '#0d211b',
    accent: '#00a084',
    accentContrast: '#ffffff',
    border: '#dcece5',
    headerText: '#56655f',
    coverMuted: 'rgba(23,33,30,0.62)',
    warn: '#c98a1e',
    warnSurface: '#fbf3e3',
    down: '#c0492f',
    ok: '#00a084',
    amber: '#c98a1e',
    red: '#c0492f',
  },
  dark: {
    bg: '#0b1412',
    surface: '#121e1a',
    surface2: '#16241f',
    text: '#eaf3ef',
    muted: '#93a39c',
    heading: '#ffffff',
    accent: '#17c79e',
    accentContrast: '#06140f',
    border: '#22322c',
    headerText: '#93a39c',
    coverMuted: 'rgba(255,255,255,0.6)',
    warn: '#e0b155',
    warnSurface: '#241d10',
    down: '#e07a5f',
    ok: '#17c79e',
    amber: '#e0b155',
    red: '#e07a5f',
  },
  green: {
    bg: '#123524',
    surface: '#153a27',
    surface2: '#194330',
    text: '#eaf5ee',
    muted: '#a9c9b5',
    heading: '#ffffff',
    accent: '#7fd9a6',
    accentContrast: '#123524',
    border: 'rgba(255,255,255,0.16)',
    headerText: '#a9c9b5',
    coverMuted: 'rgba(255,255,255,0.6)',
    warn: '#e7c07a',
    warnSurface: 'rgba(231,192,122,0.12)',
    down: '#e39b86',
    ok: '#7fd9a6',
    amber: '#e7c07a',
    red: '#e39b86',
  },
} as const

export type BuffaloThemeName = keyof typeof BUFFALO_PALETTES
export type BuffaloPalette = (typeof BUFFALO_PALETTES)[BuffaloThemeName]

/** Convierte una paleta en variables CSS (--bf-*) para el contenedor raíz. */
export function paletteToCssVars(theme: BuffaloThemeName): CSSProperties {
  const p = BUFFALO_PALETTES[theme]
  return {
    ['--bf-bg' as string]: p.bg,
    ['--bf-surface' as string]: p.surface,
    ['--bf-surface2' as string]: p.surface2,
    ['--bf-text' as string]: p.text,
    ['--bf-muted' as string]: p.muted,
    ['--bf-heading' as string]: p.heading,
    ['--bf-accent' as string]: p.accent,
    ['--bf-accent-contrast' as string]: p.accentContrast,
    ['--bf-border' as string]: p.border,
    ['--bf-header-text' as string]: p.headerText,
    ['--bf-cover-muted' as string]: p.coverMuted,
    ['--bf-warn' as string]: p.warn,
    ['--bf-warn-surface' as string]: p.warnSurface,
    ['--bf-down' as string]: p.down,
    ['--bf-ok' as string]: p.ok,
    ['--bf-amber' as string]: p.amber,
    ['--bf-red' as string]: p.red,
  }
}

/**
 * Elimina emojis y símbolos pictográficos del texto. NO toca flechas ↑↓ ni
 * formas geométricas (▲▼) porque los informes las usan como lectura de KPIs.
 */
// Rangos emoji/pictográficos. Se evita el flag `u` (no soportado por el target
// TS) usando pares subrogados para el plano astral (U+1F000–U+1FFFF).
const EMOJI_RE =
  /[\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF\uFE00-\uFE0F\u200D]|[\uD83C-\uD83F][\uDC00-\uDFFF]/g

export function stripEmojis(input: string): string {
  if (!input) return ''
  return input
    .replace(EMOJI_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
}

export type SemaforoLevel = 'ok' | 'amber' | 'red'

/** Detecta un nivel de semáforo a partir de una palabra (Verde/Ámbar/Rojo). */
export function detectSemaforo(word: string | null | undefined): SemaforoLevel | null {
  if (!word) return null
  const w = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (w.startsWith('verde')) return 'ok'
  if (w.startsWith('ambar')) return 'amber'
  if (w.startsWith('rojo')) return 'red'
  return null
}

export const SEMAFORO_LABEL: Record<SemaforoLevel, string> = {
  ok: 'Verde',
  amber: 'Ámbar',
  red: 'Rojo',
}
