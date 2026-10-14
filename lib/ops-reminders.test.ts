import { describe, expect, it } from 'vitest'
import { madridCalendarDaysBetween, madridYmd } from '@/lib/ops-reminders'

describe('recordatorios ops', () => {
  it('cuenta días de calendario en Madrid', () => {
    const a = new Date('2026-10-13T22:00:00.000Z')
    const b = new Date('2026-10-14T10:00:00.000Z')
    expect(madridCalendarDaysBetween(a, b)).toBeGreaterThanOrEqual(0)
    expect(madridYmd(a)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('el mismo instante es 0 días', () => {
    const d = new Date('2026-10-14T12:00:00.000Z')
    expect(madridCalendarDaysBetween(d, d)).toBe(0)
  })
})
