/** Objetivo anual de facturación Buffalo (alineado con dashboard) */
export const ANNUAL_TARGET = 250_000

/** Paleta minimalista — escala de grises del CRM */
export const CHART_PALETTE = [
  '#111827', // gray-900
  '#374151', // gray-700
  '#4B5563', // gray-600
  '#6B7280', // gray-500
  '#9CA3AF', // gray-400
  '#D1D5DB', // gray-300
  '#1F2937', // gray-800
  '#E5E7EB', // gray-200
] as const

export function chartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]
}

export const fmtEur = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

export const fmtPct = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format(v / 100)
