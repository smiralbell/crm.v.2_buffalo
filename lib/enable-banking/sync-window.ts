/** Días de margen al pedir movimientos desde la última sync */
export const BANK_SYNC_MARGIN_DAYS = 2

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Desde qué fecha pedir movimientos nuevos */
export function computeSyncFromDate(
  lastSyncedAt: Date | null | undefined,
  sessionCreatedAt: Date
): { from: string; anchor: string; anchor_source: 'last_sync' | 'session_created' } {
  const anchorDate = lastSyncedAt ?? sessionCreatedAt
  const from = new Date(anchorDate.getTime() - BANK_SYNC_MARGIN_DAYS * 24 * 60 * 60 * 1000)
  return {
    from: isoDate(from),
    anchor: isoDate(anchorDate),
    anchor_source: lastSyncedAt ? 'last_sync' : 'session_created',
  }
}

/** Mes anterior al actual (muestra para debug de la API) */
export function previousCalendarMonth(now = new Date()): {
  year: number
  month: number
  from: string
  to: string
  label: string
} {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const y = d.getFullYear()
  const m = d.getMonth()
  const monthStart = new Date(y, m, 1)
  const monthEnd = new Date(y, m + 1, 0)
  return {
    year: y,
    month: m + 1,
    from: isoDate(monthStart),
    to: isoDate(monthEnd),
    label: `${y}-${String(m + 1).padStart(2, '0')}`,
  }
}
