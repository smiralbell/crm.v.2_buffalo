import { describe, expect, it } from 'vitest'
import { checklistRemindLabel, isChecklistReminderDue, madridDateTimeParts } from '@/lib/checklist/remind'

function item(partial: {
  remind_every_days?: number
  remind_weekday?: number | null
  remind_time?: string | null
  last_reminded_at?: string | null
  created_at?: string
}) {
  return {
    remind_every_days: partial.remind_every_days ?? 1,
    remind_weekday: partial.remind_weekday ?? null,
    remind_time: partial.remind_time ?? '09:00',
    last_reminded_at: partial.last_reminded_at ?? null,
    created_at: partial.created_at ?? '2026-10-01T08:00:00.000Z',
  }
}

describe('recordatorio checklist', () => {
  it('etiqueta cada X días y un día a una hora', () => {
    expect(checklistRemindLabel(item({ remind_every_days: 5, remind_time: '08:30' }))).toBe(
      'Cada 5 días a las 08:30'
    )
    expect(
      checklistRemindLabel(item({ remind_every_days: 0, remind_weekday: 1, remind_time: '10:00' }))
    ).toBe('Los lunes a las 10:00')
  })

  it('cada día: no avisa el mismo día de creación', () => {
    const created = '2026-10-12T07:00:00.000Z'
    const nowSameDay = new Date('2026-10-12T12:00:00.000Z')
    expect(isChecklistReminderDue(item({ created_at: created, remind_every_days: 1 }), nowSameDay)).toBe(
      false
    )
  })

  it('cada 3 días avisa cuando ya toca y ha pasado la hora', () => {
    const last = '2026-10-09T07:00:00.000Z'
    const tooSoon = new Date('2026-10-12T06:30:00.000Z')
    const due = new Date('2026-10-12T07:30:00.000Z')
    expect(
      isChecklistReminderDue(item({ last_reminded_at: last, remind_every_days: 3, remind_time: '09:00' }), tooSoon)
    ).toBe(false)
    expect(
      isChecklistReminderDue(item({ last_reminded_at: last, remind_every_days: 3, remind_time: '09:00' }), due)
    ).toBe(true)
  })

  it('lunes a las 09:00: solo ese día y a partir de esa hora', () => {
    const created = '2026-10-05T08:00:00.000Z'
    const mondayEarly = new Date('2026-10-12T06:30:00.000Z')
    const mondayOk = new Date('2026-10-12T07:30:00.000Z')
    const tuesday = new Date('2026-10-13T08:00:00.000Z')
    expect(madridDateTimeParts(mondayOk).isoDow).toBe(1)
    expect(
      isChecklistReminderDue(
        item({ created_at: created, remind_every_days: 0, remind_weekday: 1, remind_time: '09:00' }),
        mondayEarly
      )
    ).toBe(false)
    expect(
      isChecklistReminderDue(
        item({ created_at: created, remind_every_days: 0, remind_weekday: 1, remind_time: '09:00' }),
        mondayOk
      )
    ).toBe(true)
    expect(
      isChecklistReminderDue(
        item({ created_at: created, remind_every_days: 0, remind_weekday: 1, remind_time: '09:00' }),
        tuesday
      )
    ).toBe(false)
  })

  it('no vuelve a avisar el mismo día', () => {
    const last = '2026-10-12T07:15:00.000Z'
    const later = new Date('2026-10-12T15:00:00.000Z')
    expect(
      isChecklistReminderDue(
        item({ last_reminded_at: last, remind_every_days: 0, remind_weekday: 1, remind_time: '09:00' }),
        later
      )
    ).toBe(false)
  })
})
