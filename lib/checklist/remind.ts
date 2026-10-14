export const WEEKDAY_OPTIONS = [
  { iso: 1, label: 'Lunes' },
  { iso: 2, label: 'Martes' },
  { iso: 3, label: 'Miércoles' },
  { iso: 4, label: 'Jueves' },
  { iso: 5, label: 'Viernes' },
  { iso: 6, label: 'Sábado' },
  { iso: 7, label: 'Domingo' },
] as const

export type ChecklistRemindMode = 'off' | 'every_days' | 'weekly'

export type ChecklistRemindFields = {
  remind_every_days: number
  remind_weekday: number | null
  remind_time: string | null
  last_reminded_at: string | null
  created_at: string
}

const WD: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

export function madridDateTimeParts(d: Date): { ymd: string; isoDow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    isoDow: WD[get('weekday')] || 1,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  }
}

export function normalizeRemindTime(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  const m = /^(\d{1,2}):(\d{2})/.exec(s)
  if (!m) return null
  const h = Math.max(0, Math.min(23, Number(m[1])))
  const min = Math.max(0, Math.min(59, Number(m[2])))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function normalizeWeekday(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1 || n > 7) return null
  return n
}

function timeToMinutes(t: string | null): number {
  const norm = normalizeRemindTime(t) || '00:00'
  const [h, m] = norm.split(':').map(Number)
  return h * 60 + m
}

function madridCalendarDaysBetween(from: Date, to: Date): number {
  const a = madridDateTimeParts(from).ymd
  const b = madridDateTimeParts(to).ymd
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  return Math.round((db - da) / 86_400_000)
}

export function checklistRemindMode(item: Pick<ChecklistRemindFields, 'remind_every_days' | 'remind_weekday'>): ChecklistRemindMode {
  if (item.remind_weekday != null) return 'weekly'
  if (item.remind_every_days > 0) return 'every_days'
  return 'off'
}

export function checklistRemindLabel(item: Pick<ChecklistRemindFields, 'remind_every_days' | 'remind_weekday' | 'remind_time'>): string {
  const time = normalizeRemindTime(item.remind_time)
  const timeBit = time && time !== '00:00' ? ` a las ${time}` : ''
  if (item.remind_weekday != null) {
    const day = WEEKDAY_OPTIONS.find((d) => d.iso === item.remind_weekday)?.label || `día ${item.remind_weekday}`
    return `Los ${day.toLowerCase()}${time ? ` a las ${time}` : ''}`
  }
  if (item.remind_every_days > 0) {
    const n = item.remind_every_days
    const base = n === 1 ? 'Cada día' : `Cada ${n} días`
    return `${base}${timeBit}`
  }
  return 'No recordar'
}

export function isChecklistReminderDue(item: ChecklistRemindFields, now = new Date()): boolean {
  const mode = checklistRemindMode(item)
  if (mode === 'off') return false
  const nowP = madridDateTimeParts(now)
  const lastIso = item.last_reminded_at || item.created_at
  const last = new Date(lastIso)
  if (Number.isNaN(last.getTime())) return false
  const lastP = madridDateTimeParts(last)
  if (lastP.ymd === nowP.ymd && item.last_reminded_at) return false

  const targetMin = timeToMinutes(item.remind_time)

  if (mode === 'weekly') {
    if (nowP.isoDow !== item.remind_weekday) return false
    if (nowP.minutes < targetMin) return false
    if (item.last_reminded_at && lastP.ymd === nowP.ymd) return false
    return true
  }

  const n = Math.max(1, Math.floor(item.remind_every_days))
  const days = madridCalendarDaysBetween(last, now)
  if (days < n) return false
  if (days > n) return true
  return nowP.minutes >= targetMin
}
