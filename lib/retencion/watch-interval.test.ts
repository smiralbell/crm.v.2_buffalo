import { describe, expect, it } from 'vitest'
import { formatWatchInterval, minutesToParts, partsToMinutes } from '@/lib/retencion/watch-interval'
import { pickCursorColumn } from '@/lib/retencion/watch-db-memory'

describe('intervalo de vigilancia', () => {
  it('formatea minutos, horas y días', () => {
    expect(formatWatchInterval(0)).toBe('Pausado')
    expect(formatWatchInterval(45)).toBe('Cada 45 min')
    expect(formatWatchInterval(60)).toBe('Cada hora')
    expect(formatWatchInterval(120)).toBe('Cada 2 h')
    expect(formatWatchInterval(1440)).toBe('Cada día')
    expect(formatWatchInterval(2880)).toBe('Cada 2 días')
  })

  it('convierte ida y vuelta', () => {
    expect(partsToMinutes(2, 'hours')).toBe(120)
    expect(minutesToParts(120)).toEqual({ amount: 2, unit: 'hours', paused: false })
    expect(minutesToParts(0).paused).toBe(true)
  })
})

describe('cursor incremental', () => {
  it('prefiere updated_at a id', () => {
    const c = pickCursorColumn([
      { column: 'id', data_type: 'integer' },
      { column: 'name', data_type: 'text' },
      { column: 'updated_at', data_type: 'timestamp with time zone' },
    ])
    expect(c?.column).toBe('updated_at')
    expect(c?.kind).toBe('time')
  })

  it('cae a id entero si no hay fecha', () => {
    const c = pickCursorColumn([
      { column: 'id', data_type: 'bigint' },
      { column: 'title', data_type: 'text' },
    ])
    expect(c?.column).toBe('id')
    expect(c?.kind).toBe('int')
  })
})
