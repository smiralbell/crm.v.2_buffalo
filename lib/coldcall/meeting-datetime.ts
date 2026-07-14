const MONTHS_ES: Record<string, number> = {
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11,
}

/** "17 jul 2026, 13:00" desde notas de Cal.com */
export function parseMeetingDateFromNotas(notas: string | null | undefined): Date | null {
  if (!notas?.trim()) return null

  const match = notas.match(
    /Reunión(?:\s+agendada en)?\s+Cal\.com:\s*(\d{1,2})\s+([a-záéíóúñ]+)\s+(\d{4}),?\s*(\d{1,2}):(\d{2})/i
  )
  if (!match) return null

  const day = parseInt(match[1], 10)
  const monthKey = match[2].slice(0, 3).toLowerCase()
  const year = parseInt(match[3], 10)
  const hour = parseInt(match[4], 10)
  const minute = parseInt(match[5], 10)
  const month = MONTHS_ES[monthKey]
  if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) return null

  // Hora en Madrid (usuario comercial)
  const d = new Date(Date.UTC(year, month, day, hour - 2, minute))
  return Number.isNaN(d.getTime()) ? null : d
}

export function parseReunionDatetimeInput(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null
  const s = value.trim()

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
