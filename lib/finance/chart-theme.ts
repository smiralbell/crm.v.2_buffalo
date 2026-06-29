/** Objetivo anual de facturación Buffalo (alineado con dashboard) */
export const ANNUAL_TARGET = 250_000

/** Paleta minimalista — escala de grises del CRM */
export const CHART_PALETTE = [
  '#111827',
  '#374151',
  '#4B5563',
  '#6B7280',
  '#9CA3AF',
  '#D1D5DB',
  '#1F2937',
  '#E5E7EB',
] as const

export function chartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]
}

/** Solo para alertas (verde / naranja / rojo) */
export const ALERT_COLORS = {
  good: '#16A34A',
  medium: '#EA580C',
  bad: '#DC2626',
} as const

export const fmtEur = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

export const fmtPct = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format(v / 100)
