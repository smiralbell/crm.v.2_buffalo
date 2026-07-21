import type { CalendarApiEvent } from '@/components/calendario/calendar-types'

const TZ = 'Europe/Madrid'

export function madridDateKey(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

export function madridTodayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

export function madridTomorrowKey(): string {
  const today = madridTodayKey()
  const [y, m, d] = today.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

export function fmtEventTime(ev: CalendarApiEvent): string {
  if (ev.allDay) return 'Todo el día'
  const s = new Date(ev.start)
  const e = new Date(ev.end)
  const t: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone: TZ }
  return `${s.toLocaleTimeString('es-ES', t)} – ${e.toLocaleTimeString('es-ES', t)}`
}

export function fmtRange(start: string, end: string, allDay: boolean) {
  if (allDay) {
    const s = new Date(start.includes('T') ? start : `${start}T12:00:00`)
    const eRaw = new Date(end.includes('T') ? end : `${end}T12:00:00`)
    const e = new Date(eRaw.getTime() - 24 * 60 * 60 * 1000)
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: TZ,
    }
    const a = s.toLocaleDateString('es-ES', opts)
    const b = e.toLocaleDateString('es-ES', opts)
    return a === b ? `${a} · Todo el día` : `${a} → ${b} · Todo el día`
  }
  const s = new Date(start)
  const e = new Date(end)
  const dOpts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  }
  const tOpts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }
  return `${s.toLocaleDateString('es-ES', dOpts)} · ${s.toLocaleTimeString('es-ES', tOpts)} – ${e.toLocaleTimeString('es-ES', tOpts)}`
}

export type AgendaSection = {
  key: string
  label: string
  events: CalendarApiEvent[]
}

export function groupEventsByDay(events: CalendarApiEvent[]): AgendaSection[] {
  const today = madridTodayKey()
  const tomorrow = madridTomorrowKey()
  const byDay = new Map<string, CalendarApiEvent[]>()

  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )

  for (const ev of sorted) {
    const key = madridDateKey(ev.start)
    const list = byDay.get(key) || []
    list.push(ev)
    byDay.set(key, list)
  }

  const keys = Array.from(byDay.keys()).sort()
  return keys.map((key) => {
    let label: string
    if (key === today) label = 'Hoy'
    else if (key === tomorrow) label = 'Mañana'
    else {
      const d = new Date(`${key}T12:00:00`)
      label = d.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        timeZone: TZ,
      })
      label = label.charAt(0).toUpperCase() + label.slice(1)
    }
    return { key, label, events: byDay.get(key) || [] }
  })
}

export function agendaRangeIso(): { timeMin: string; timeMax: string } {
  const today = madridTodayKey()
  const [y, m, d] = today.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1, d + 15))
  const timeMin = new Date(`${today}T00:00:00`).toISOString()
  const timeMax = new Date(`${end.toISOString().slice(0, 10)}T23:59:59`).toISOString()
  return { timeMin, timeMax }
}
