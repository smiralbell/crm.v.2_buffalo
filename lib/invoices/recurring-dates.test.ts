import { describe, expect, it } from 'vitest'
import { madridToday, madridWallTime, nextMadridTime } from './recurring-dates'

describe('madridWallTime', () => {
  it('las 9:00 de Madrid son las 8:00 UTC en invierno y las 7:00 en verano', () => {
    expect(madridWallTime('2026-11-05', '09:00').toISOString()).toBe('2026-11-05T08:00:00.000Z')
    expect(madridWallTime('2026-07-05', '09:00').toISOString()).toBe('2026-07-05T07:00:00.000Z')
  })

  it('acierta los días de cambio de hora', () => {
    // 29 de marzo de 2026: a las 2:00 pasan a ser las 3:00
    expect(madridWallTime('2026-03-29', '09:00').toISOString()).toBe('2026-03-29T07:00:00.000Z')
    // 25 de octubre de 2026: a las 3:00 vuelven a ser las 2:00
    expect(madridWallTime('2026-10-25', '09:00').toISOString()).toBe('2026-10-25T08:00:00.000Z')
  })
})

describe('nextMadridTime', () => {
  it('antes de las 9:00, hoy a las 9:00', () => {
    expect(nextMadridTime('09:00', new Date('2026-11-05T07:59:00Z')).toISOString()).toBe('2026-11-05T08:00:00.000Z')
  })

  it('a las 9:00 o después, mañana a las 9:00', () => {
    expect(nextMadridTime('09:00', new Date('2026-11-05T08:00:00Z')).toISOString()).toBe('2026-11-06T08:00:00.000Z')
    expect(nextMadridTime('09:00', new Date('2026-11-05T22:30:00Z')).toISOString()).toBe('2026-11-06T08:00:00.000Z')
  })

  it('cruza el cambio de hora de octubre', () => {
    // sábado 24 a las 10:00 de Madrid (verano) → domingo 25 a las 9:00 (ya invierno)
    expect(nextMadridTime('09:00', new Date('2026-10-24T08:00:00Z')).toISOString()).toBe('2026-10-25T08:00:00.000Z')
  })

  it('pasada la medianoche de Madrid ya cuenta como el día siguiente', () => {
    // 23:30 UTC del 5 = 0:30 del 6 en Madrid
    expect(madridToday(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06')
    expect(nextMadridTime('09:00', new Date('2026-11-05T23:30:00Z')).toISOString()).toBe('2026-11-06T08:00:00.000Z')
  })
})
