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

export function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
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
