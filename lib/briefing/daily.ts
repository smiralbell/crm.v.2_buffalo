/**
 * Briefing diario a los administradores (correo + Telegram).
 * Cada mañana laborable, a BRIEFING_HOUR (8 por defecto, hora de Madrid):
 * devoluciones de llamada vencidas/de hoy y reuniones por confirmar.
 */
import { notify } from '@/lib/alerts'
import type { ColdCallCallbackRow } from '@/lib/coldcall/callbacks'
import type { MeetingReminderRow } from '@/lib/coldcall/meeting-reminders'
import { getColdCallTeamUserIds } from '@/lib/coldcall/scope'

const TZ = 'Europe/Madrid'

function madridParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    weekday: get('weekday'),
  }
}

const madridDate = (iso: string) => madridParts(new Date(iso)).date
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

export function buildAdminBriefing(input: {
  today: string
  callbacks: ColdCallCallbackRow[]
  toConfirm: MeetingReminderRow[]
}): { title: string; body: string } {
  const overdue = input.callbacks.filter((c) => madridDate(c.at) < input.today)
  const today = input.callbacks.filter((c) => madridDate(c.at) === input.today)
  const who = (c: { nombre: string; empresa: string | null }) => (c.empresa ? `${c.nombre} (${c.empresa})` : c.nombre)

  const lines: string[] = []
  if (!overdue.length && !today.length && !input.toConfirm.length) {
    return { title: `Briefing comercial · ${input.today}`, body: 'Sin devoluciones ni reuniones pendientes de confirmar.' }
  }
  if (today.length) {
    lines.push(`Devoluciones de hoy (${today.length})`)
    for (const c of today.slice(0, 8)) lines.push(`• ${hhmm(c.at)} · ${who(c)}`)
    if (today.length > 8) lines.push(`• …y ${today.length - 8} más`)
    lines.push('')
  }
  if (overdue.length) {
    lines.push(`Vencidas (${overdue.length})`)
    for (const c of overdue.slice(0, 5)) lines.push(`• ${who(c)}`)
    if (overdue.length > 5) lines.push(`• …y ${overdue.length - 5} más`)
    lines.push('')
  }
  if (input.toConfirm.length) {
    lines.push(`Reuniones por confirmar (${input.toConfirm.length})`)
    for (const m of input.toConfirm.slice(0, 5)) lines.push(`• ${hhmm(m.at)} · ${who(m)}`)
  }
  return { title: `Briefing comercial · ${input.today}`, body: lines.join('\n').trim() }
}

export async function sendDueBriefings(now = new Date()): Promise<{ sent: number; reason: string }> {
  const { date, hour, weekday } = madridParts(now)
  const startHour = Number(process.env.BRIEFING_HOUR || 8)
  if (hour < startHour || hour >= startHour + 3) return { sent: 0, reason: 'fuera de hora' }
  if ((weekday === 'Sat' || weekday === 'Sun') && process.env.BRIEFING_WEEKENDS !== '1') {
    return { sent: 0, reason: 'fin de semana' }
  }

  const teamIds = await getColdCallTeamUserIds()
  if (!teamIds.length) return { sent: 0, reason: 'sin equipo comercial' }
  const scope = { mode: 'team' as const, userIds: teamIds }
  const { listColdCallCallbacks } = await import('@/lib/coldcall/callbacks')
  const { listConfirmReminders } = await import('@/lib/coldcall/meeting-reminders')
  const [callbacks, toConfirm] = await Promise.all([
    listColdCallCallbacks(scope, { daysBack: 7, daysAhead: 1 }),
    listConfirmReminders(scope).then((r) => r.filter((m) => !m.confirm_status || m.confirm_status === 'pending')),
  ])
  const { title, body } = buildAdminBriefing({ today: date, callbacks, toConfirm })
  await notify({
    kind: 'briefing.diario',
    title,
    body,
    link: '/comercial',
    severity: 'info',
    dedupeKey: `briefing:${date}`,
  })
  return { sent: 1, reason: 'enviado' }
}
