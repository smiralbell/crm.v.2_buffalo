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

/** Mismo día del mes siguiente. Si ese mes es más corto, usa el último día. */
export function nextMonthOnDay(iso: string, dayOfMonth: number): string {
  const parsed = parseIsoDate(iso)
  if (!parsed) return iso
  const monthIndex = parsed.month
  const year = monthIndex === 12 ? parsed.year + 1 : parsed.year
  const month = monthIndex === 12 ? 1 : monthIndex + 1
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(dayOfMonth, dim)
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}
