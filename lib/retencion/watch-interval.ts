export type WatchIntervalUnit = 'minutes' | 'hours' | 'days'

export const WATCH_MAX_MINUTES = 86_400 // 60 días

export function minutesToParts(minutes: number): {
  amount: number
  unit: WatchIntervalUnit
  paused: boolean
} {
  if (!minutes || minutes <= 0) return { amount: 1, unit: 'hours', paused: true }
  if (minutes % 1440 === 0) return { amount: minutes / 1440, unit: 'days', paused: false }
  if (minutes % 60 === 0) return { amount: minutes / 60, unit: 'hours', paused: false }
  return { amount: minutes, unit: 'minutes', paused: false }
}

export function partsToMinutes(amount: number, unit: WatchIntervalUnit): number {
  const n = Math.max(1, Math.floor(Number(amount) || 1))
  if (unit === 'days') return Math.min(WATCH_MAX_MINUTES, n * 1440)
  if (unit === 'hours') return Math.min(WATCH_MAX_MINUTES, n * 60)
  return Math.min(WATCH_MAX_MINUTES, n)
}

export function formatWatchInterval(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return 'Pausado'
  const { amount, unit } = minutesToParts(minutes)
  if (unit === 'days') return amount === 1 ? 'Cada día' : `Cada ${amount} días`
  if (unit === 'hours') return amount === 1 ? 'Cada hora' : `Cada ${amount} h`
  return amount === 1 ? 'Cada 1 min' : `Cada ${amount} min`
}
