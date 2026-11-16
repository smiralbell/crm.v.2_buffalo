const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Minutos que Madrid va por delante de UTC en ese instante (60 en invierno, 120 en verano). */
function madridOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((wall - Math.floor(utcMs / 60_000) * 60_000) / 60_000)
}

/** «2026-11-05» a las «09:00» de Madrid, como instante real. */
export function madridWallTime(dateIso: string, hhmm: string): Date {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, min)
  let ts = wall - madridOffsetMinutes(wall) * 60_000
  ts = wall - madridOffsetMinutes(ts) * 60_000
  return new Date(ts)
}

/** La próxima vez (estrictamente después de `now`) que en Madrid sean las `hhmm`. */
export function nextMadridTime(hhmm: string, now: Date = new Date()): Date {
  const today = madridToday(now)
  const candidate = madridWallTime(today, hhmm)
  if (candidate.getTime() > now.getTime()) return candidate
  const [y, m, d] = today.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return madridWallTime(tomorrow, hhmm)
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null
  }
  return { year, month, day }
}

export function formatSpanishDate(iso: string): string {
  const parsed = parseIsoDate(iso.slice(0, 10))
  if (!parsed) return iso
  return `${parsed.day} de ${MONTHS[parsed.month - 1]} de ${parsed.year}`
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`
}

function shiftMonth(iso: string, delta: number, dayOfMonth: number): string {
  const parsed = parseIsoDate(iso)
  if (!parsed) return iso
  const monthIndex = parsed.month - 1 + delta
  const year = parsed.year + Math.floor(monthIndex / 12)
  const month = ((monthIndex % 12) + 12) % 12 + 1
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(dayOfMonth, dim)
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** Mismo día del mes siguiente. Si ese mes es más corto, usa el último día. */
export function nextMonthOnDay(iso: string, dayOfMonth: number): string {
  return shiftMonth(iso, 1, dayOfMonth)
}

/** Mismo día del mes anterior. Si ese mes es más corto, usa el último día. */
export function previousMonthOnDay(iso: string, dayOfMonth: number): string {
  return shiftMonth(iso, -1, dayOfMonth)
}

export function formatSpanishDayMonth(iso: string): string {
  const parsed = parseIsoDate(iso.slice(0, 10))
  if (!parsed) return iso
  return `${parsed.day} de ${MONTHS[parsed.month - 1]}`
}

/**
 * El periodo facturado termina el día de la factura y empieza el mismo día del mes anterior.
 * 15 de diciembre → "Mantenimiento del 15 de noviembre al 15 de diciembre".
 */
export function maintenanceConcept(base: string, issueIso: string, issueDay: number): string {
  const end = issueIso.slice(0, 10)
  const start = previousMonthOnDay(end, issueDay)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const startText = sameYear ? formatSpanishDayMonth(start) : formatSpanishDate(start)
  const endText = sameYear ? formatSpanishDayMonth(end) : formatSpanishDate(end)
  const label = base.trim() || 'Mantenimiento'
  return `${label} del ${startText} al ${endText}`
}
