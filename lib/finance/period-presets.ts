import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
} from 'date-fns'
import { es } from 'date-fns/locale'

/** Finanzas: no mostrar movimientos anteriores a esta fecha */
export const FINANCE_BANK_MIN_DATE = '2025-01-01'

export function getFinanceMinDate(): Date {
  return startOfDay(new Date(FINANCE_BANK_MIN_DATE))
}

export function clampPeriodStart(start: Date): Date {
  const min = getFinanceMinDate()
  const normalized = startOfDay(start)
  return normalized < min ? min : normalized
}

export function clampPeriodRange(range: PeriodRange): PeriodRange {
  return {
    start: clampPeriodStart(range.start),
    end: range.end,
  }
}

export type PeriodPresetId =
  | '7d'
  | '30d'
  | '90d'
  | 'month'
  | 'prev_month'
  | 'quarter'
  | 'year'
  | 'custom'

export interface PeriodRange {
  start: Date
  end: Date
}

export const PERIOD_PRESETS: Array<{ id: PeriodPresetId; label: string }> = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'month', label: 'Mes' },
  { id: 'prev_month', label: 'Anterior' },
  { id: 'quarter', label: 'Trim.' },
  { id: 'year', label: 'Año' },
  { id: 'custom', label: 'Rango' },
]

export function getDefaultPeriodRange(now = new Date()): PeriodRange {
  return {
    start: getFinanceMinDate(),
    end: endOfMonth(now),
  }
}

export function getPeriodRangeForPreset(preset: PeriodPresetId, now = new Date()): PeriodRange {
  const today = endOfDay(now)

  let range: PeriodRange

  switch (preset) {
    case '7d':
      range = { start: startOfDay(subDays(today, 6)), end: today }
      break
    case '30d':
      range = { start: startOfDay(subDays(today, 29)), end: today }
      break
    case '90d':
      range = { start: startOfDay(subDays(today, 89)), end: today }
      break
    case 'month':
      range = { start: startOfMonth(now), end: endOfMonth(now) }
      break
    case 'prev_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      range = { start: startOfMonth(prev), end: endOfMonth(prev) }
      break
    }
    case 'quarter':
      range = { start: startOfQuarter(now), end: endOfQuarter(now) }
      break
    case 'year':
    case 'custom':
    default:
      range = getDefaultPeriodRange(now)
      break
  }

  return clampPeriodRange(range)
}

export function periodDays(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
}

export function formatPeriodLabel(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()

  if (sameMonth && start.getDate() === 1 && end.getDate() === endOfMonth(end).getDate()) {
    return format(start, 'MMMM yyyy', { locale: es })
  }

  const fmtStart = sameYear ? 'd MMM' : 'd MMM yyyy'
  const fmtEnd = 'd MMM yyyy'
  return `${format(start, fmtStart, { locale: es })} – ${format(end, fmtEnd, { locale: es })}`
}

export function detectPeriodPreset(start: Date, end: Date, now = new Date()): PeriodPresetId {
  const startKey = format(startOfDay(start), 'yyyy-MM-dd')
  const endKey = format(startOfDay(end), 'yyyy-MM-dd')

  for (const preset of PERIOD_PRESETS) {
    if (preset.id === 'custom') continue
    const range = getPeriodRangeForPreset(preset.id, now)
    if (
      format(range.start, 'yyyy-MM-dd') === startKey &&
      format(range.end, 'yyyy-MM-dd') === endKey
    ) {
      return preset.id
    }
  }
  return 'custom'
}

export function parsePeriodFromQuery(
  startParam?: string,
  endParam?: string
): PeriodRange {
  if (startParam && endParam) {
    const start = startOfDay(new Date(startParam))
    const end = endOfDay(new Date(endParam))
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return clampPeriodRange({ start, end })
    }
  }
  return getDefaultPeriodRange()
}
