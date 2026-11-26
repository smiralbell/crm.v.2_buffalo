import { describe, expect, it } from 'vitest'
import { applyConfirmed, computeMinutes, taskTotal, zonedToUtc } from './formula'

const TZ = 'Europe/Madrid'
// Lunes 23 nov 2026
const at = (d: number, h: number, min = 0) => zonedToUtc(2026, 11, d, h * 60 + min, TZ)
const range = { from: at(23, 0), to: at(29, 23, 59) }
const now = at(30, 12)

describe('fórmula de horas', () => {
  it('cuenta solo el horario laboral (sin comida ni noche)', () => {
    // De lunes 8:00 a martes 10:00: lunes 8 h + martes 1 h
    const t = computeMinutes([{ person: 'ana', task: 't1', start: at(23, 8), end: at(24, 10) }], range.from, range.to, { now })
    expect(taskTotal(t, 'ana', 't1')).toBe(9 * 60)
    expect(t.get('ana')!.get('t1')!.get('2026-11-23')).toBe(8 * 60)
  })

  it('no cuenta fines de semana', () => {
    const t = computeMinutes([{ person: 'ana', task: 't1', start: at(28, 9), end: at(29, 18) }], range.from, range.to, { now })
    expect(taskTotal(t, 'ana', 't1')).toBe(0)
  })

  it('reparte el tiempo entre tareas a la vez: nunca más de la jornada', () => {
    const t = computeMinutes(
      [
        { person: 'ana', task: 't1', start: at(23, 9), end: at(23, 18) },
        { person: 'ana', task: 't2', start: at(23, 9), end: at(23, 18) },
      ],
      range.from,
      range.to,
      { now }
    )
    expect(taskTotal(t, 'ana', 't1')).toBe(4 * 60)
    expect(taskTotal(t, 'ana', 't2')).toBe(4 * 60)
  })

  it('cada persona de una tarea compartida cuenta su tiempo', () => {
    const t = computeMinutes(
      [
        { person: 'ana', task: 't1', start: at(23, 9), end: at(23, 11) },
        { person: 'luis', task: 't1', start: at(23, 9), end: at(23, 11) },
      ],
      range.from,
      range.to,
      { now }
    )
    expect(taskTotal(t, 'ana', 't1')).toBe(120)
    expect(taskTotal(t, 'luis', 't1')).toBe(120)
  })

  it('una tarea que sigue en curso cuenta hasta ahora', () => {
    const t = computeMinutes([{ person: 'ana', task: 't1', start: at(23, 9), end: null }], range.from, range.to, {
      now: at(23, 11),
    })
    expect(taskTotal(t, 'ana', 't1')).toBe(120)
  })

  it('validación pausa: dos tramos en curso suman solo su tiempo', () => {
    const t = computeMinutes(
      [
        { person: 'ana', task: 't1', start: at(23, 9), end: at(23, 10) },
        { person: 'ana', task: 't1', start: at(23, 16), end: at(23, 17) },
      ],
      range.from,
      range.to,
      { now }
    )
    expect(taskTotal(t, 'ana', 't1')).toBe(120)
  })

  it('lo confirmado manda y respeta en qué días se trabajó', () => {
    const t = computeMinutes(
      [{ person: 'ana', task: 't1', start: at(23, 9), end: at(24, 18) }],
      range.from,
      range.to,
      { now }
    )
    applyConfirmed(t, [{ person: 'ana', task: 't1', hours: 4, day: '2026-11-24' }])
    expect(taskTotal(t, 'ana', 't1')).toBeCloseTo(240)
    expect(t.get('ana')!.get('t1')!.get('2026-11-23')).toBeCloseTo(120)
  })

  it('confirmar sin nada calculado lo apunta el día de la confirmación', () => {
    const t = computeMinutes([], range.from, range.to, { now })
    applyConfirmed(t, [{ person: 'ana', task: 't9', hours: 1.5, day: '2026-11-25' }])
    expect(t.get('ana')!.get('t9')!.get('2026-11-25')).toBe(90)
  })
})
