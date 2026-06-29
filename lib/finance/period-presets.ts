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
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: '90d', label: '90 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'prev_month', label: 'Mes anterior' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'year', label: 'Año en curso' },
  { id: 'custom', label: 'Personalizado' },
]

export function getDefaultPeriodRange(now = new Date()): PeriodRange {
  return {
    start: startOfYear(now),
    end: endOfMonth(now),
  }
}

export function getPeriodRangeForPreset(preset: PeriodPresetId, now = new Date()): PeriodRange {
  const today = endOfDay(now)

  switch (preset) {
    case '7d':
      return { start: startOfDay(subDays(today, 6)), end: today }
    case '30d':
      return { start: startOfDay(subDays(today, 29)), end: today }
    case '90d':
      return { start: startOfDay(subDays(today, 89)), end: today }
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'prev_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return { start: startOfMonth(prev), end: endOfMonth(prev) }
    }
    case 'quarter':
      return { start: startOfQuarter(now), end: endOfQuarter(now) }
    case 'year':
      return getDefaultPeriodRange(now)
    case 'custom':
    default:
      return getDefaultPeriodRange(now)
  }
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
      return { start, end }
    }
  }
  return getDefaultPeriodRange()
}
