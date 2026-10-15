import { describe, expect, it } from 'vitest'
import { financeYearCobrosRange } from './bank-cobros'
import { getPeriodRangeForPreset } from './period-presets'

describe('financeYearCobrosRange', () => {
  it('es el mismo rango que Finanzas → filtro Año', () => {
    const now = new Date(2026, 9, 15, 12, 0, 0)
    const goal = financeYearCobrosRange(now)
    const finances = getPeriodRangeForPreset('year', now)
    expect(goal.start.getTime()).toBe(finances.start.getTime())
    expect(goal.end.getTime()).toBe(finances.end.getTime())
  })
})
