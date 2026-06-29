/** Objetivo anual de facturación Buffalo (alineado con dashboard) */
export const ANNUAL_TARGET = 250_000

/** Paleta semántica — azul / verde / rojo / naranja, sin lilas */
export const CHART_PALETTE = [
  '#2563EB', // blue-600
  '#16A34A', // green-600
  '#DC2626', // red-600
  '#EA580C', // orange-600
  '#0891B2', // cyan-600
  '#1D4ED8', // blue-700
  '#15803D', // green-700
  '#9CA3AF', // gray-400
] as const

/** Colores por categoría de gasto (estables) */
export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  payroll: '#2563EB',
  taxes: '#DC2626',
  saas: '#0891B2',
  marketing: '#EA580C',
  professional: '#1D4ED8',
  infra: '#16A34A',
  bank: '#9CA3AF',
  other: '#6B7280',
}

export const INCOME_CATEGORY_COLORS: Record<string, string> = {
  recurring: '#16A34A',
  setup: '#2563EB',
  refunds: '#0891B2',
  other: '#6B7280',
}

export function chartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]
}

export function expenseCategoryColor(id: string, index: number): string {
  return EXPENSE_CATEGORY_COLORS[id] ?? chartColor(index)
}

export function incomeCategoryColor(id: string, index: number): string {
  return INCOME_CATEGORY_COLORS[id] ?? chartColor(index)
}

export const COLORS = {
  good: '#16A34A',
  bad: '#DC2626',
  medium: '#EA580C',
  blue: '#2563EB',
  income: '#16A34A',
  expense: '#DC2626',
  invoiced: '#2563EB',
  collected: '#16A34A',
} as const

export const fmtEur = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

export const fmtPct = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 }).format(v / 100)
