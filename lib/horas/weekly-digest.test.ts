import { describe, expect, it } from 'vitest'
import { zonedToUtc } from './formula'
import { digestText, weekStart } from './weekly-digest'

const TZ = 'Europe/Madrid'

describe('resumen semanal de horas', () => {
  it('la semana empieza el lunes a las 00:00 de Madrid', () => {
    const viernes = zonedToUtc(2026, 11, 27, 18 * 60 + 20, TZ)
    expect(weekStart(viernes).toISOString()).toBe(zonedToUtc(2026, 11, 23, 0, TZ).toISOString())
  })

  it('lista a cada persona con sus horas, su % y quién no ha registrado nada', () => {
    const text = digestText(
      {
        from: '',
        to: '',
        workday_hours: 8,
        people: [
          {
            key: 'u:1',
            user_id: 1,
            name: 'Ana',
            hours: 30,
            by_day: {},
            by_project: [{ project_id: 'p', name: 'Clínica', hours: 30 }],
            tasks: [],
          },
        ],
      },
      { from: zonedToUtc(2026, 11, 23, 0, TZ), to: zonedToUtc(2026, 11, 27, 18 * 60, TZ), idle: ['Luis'], link: 'https://crm/tareas/horas' }
    )
    expect(text).toContain('Equipo: 30 h')
    expect(text).toContain('• Ana: 30 h (75%) — Clínica 30 h')
    expect(text).toContain('Sin horas registradas: Luis')
    expect(text).toContain('https://crm/tareas/horas')
  })
})
