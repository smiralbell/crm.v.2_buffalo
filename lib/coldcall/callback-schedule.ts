import { addDays, addHours, nextMonday, setHours, setMinutes, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { format } from 'date-fns'
import { firstName } from '@/lib/coldcall/contact-templates'
import type { ComercialPersona } from '@/lib/coldcall/comercial-persona'
import { DEFAULT_CEO_PERSONA, interpolateCallText } from '@/lib/coldcall/comercial-persona'

export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function parseDatetimeLocal(value: string): Date | null {
  if (!value?.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Texto bonito: "viernes 17 de julio a las 10:00" */
export function formatCallbackWhen(value: string | Date): string {
  const d = typeof value === 'string' ? parseDatetimeLocal(value) : value
  if (!d) return ''
  return format(d, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })
}

export function formatCallbackWhenShort(value: string | Date): string {
  const d = typeof value === 'string' ? parseDatetimeLocal(value) : value
  if (!d) return ''
  return format(d, "EEE d MMM · HH:mm", { locale: es })
}

export const CALLBACK_TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '16:00', '17:00', '18:00'] as const

export function applyTimeToDate(date: Date, time: string): Date {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10))
  return setMinutes(setHours(startOfDay(date), h), m || 0)
}

export function defaultCallbackDatetime(): string {
  const now = new Date()
  let target = addHours(now, 2)
  const minutes = target.getMinutes()
  if (minutes > 0 && minutes < 30) target = setMinutes(target, 30)
  else if (minutes > 30) target = setMinutes(addHours(target, 1), 0)
  else target = setMinutes(target, 0)

  if (target.getHours() < 9) target = setHours(setMinutes(target, 0), 10)
  if (target.getHours() >= 19) {
    target = setHours(setMinutes(addDays(startOfDay(now), 1), 0), 10)
  }
  return toDatetimeLocalValue(target)
}

export function callbackQuickPresets(): { id: string; label: string; value: string }[] {
  const now = new Date()
  const tomorrow = addDays(startOfDay(now), 1)
  const monday = nextMonday(startOfDay(now))
  const mondayAt10 = setHours(setMinutes(monday, 0), 10)

  return [
    { id: '2h', label: 'En 2 h', value: defaultCallbackDatetime() },
    { id: 'tomorrow10', label: 'Mañana 10:00', value: toDatetimeLocalValue(applyTimeToDate(tomorrow, '10:00')) },
    { id: 'tomorrow16', label: 'Mañana 16:00', value: toDatetimeLocalValue(applyTimeToDate(tomorrow, '16:00')) },
    { id: 'monday10', label: 'Lunes 10:00', value: toDatetimeLocalValue(mondayAt10) },
  ]
}

export function callbackConfirmTemplate(
  lead: { nombre: string; first_name?: string | null; empresa?: string | null },
  whenLabel: string,
  persona: ComercialPersona = DEFAULT_CEO_PERSONA
): string {
  const name = firstName(lead.nombre, lead.first_name)
  const intro = interpolateCallText(
    `Hola ${name}, {{speaker_short_es}}, acabamos de hablar por teléfono.`,
    persona
  )
  if (!whenLabel) {
    return [
      intro,
      '',
      'Como acordamos, te llamaré en breve.',
      '',
      'Si prefieres otro momento, dímelo y lo ajustamos sin problema.',
      '',
      `¡Muchas gracias por tu tiempo, ${name}!`,
      'Buffalo AI',
    ].join('\n')
  }
  return [
    intro,
    '',
    `Como acordamos, te llamaré el ${whenLabel}.`,
    '',
    'Si prefieres otro momento, dímelo y lo ajustamos sin problema.',
    '',
    `¡Muchas gracias por tu tiempo, ${name}!`,
    'Buffalo AI',
  ].join('\n')
}
