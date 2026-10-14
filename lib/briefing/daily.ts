/**
 * Briefing diario por WhatsApp (primer paso: comerciales).
 * Cada mañana laborable, a la hora BRIEFING_HOUR (8 por defecto, hora de Madrid), cada comercial
 * con WhatsApp y el briefing activados en Usuarios recibe su resumen: devoluciones de llamada
 * vencidas y de hoy, y reuniones por confirmar. Se envía por la cola (reintentos) y una vez al día.
 */
import { query } from '@/lib/db'
import { enqueueJob } from '@/lib/jobs/queue'
import type { ColdCallCallbackRow } from '@/lib/coldcall/callbacks'
import type { MeetingReminderRow } from '@/lib/coldcall/meeting-reminders'

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

export function buildComercialBriefing(input: {
  name: string
  today: string
  callbacks: ColdCallCallbackRow[]
  toConfirm: MeetingReminderRow[]
  baseUrl: string
}): string {
  const overdue = input.callbacks.filter((c) => madridDate(c.at) < input.today)
  const today = input.callbacks.filter((c) => madridDate(c.at) === input.today)
  const who = (c: { nombre: string; empresa: string | null }) => (c.empresa ? `${c.nombre} (${c.empresa})` : c.nombre)

  const lines: string[] = [`☀️ *Buenos días, ${input.name.split(' ')[0]}*`, '']
  if (!overdue.length && !today.length && !input.toConfirm.length) {
    lines.push('Hoy no tienes devoluciones ni reuniones pendientes de confirmar. ¡A por la cola de llamadas!')
  } else {
    if (today.length) {
      lines.push(`📞 *Devoluciones de hoy (${today.length})*`)
      for (const c of today.slice(0, 8)) lines.push(`• ${hhmm(c.at)} · ${who(c)}`)
      if (today.length > 8) lines.push(`• …y ${today.length - 8} más`)
      lines.push('')
    }
    if (overdue.length) {
      lines.push(`⏰ *Vencidas (${overdue.length})*`)
      for (const c of overdue.slice(0, 5)) lines.push(`• ${who(c)}`)
      if (overdue.length > 5) lines.push(`• …y ${overdue.length - 5} más`)
      lines.push('')
    }
    if (input.toConfirm.length) {
      lines.push(`🤝 *Reuniones por confirmar (${input.toConfirm.length})*`)
      for (const m of input.toConfirm.slice(0, 5)) lines.push(`• ${hhmm(m.at)} · ${who(m)}`)
      lines.push('')
    }
  }
  if (input.baseUrl) lines.push(`${input.baseUrl}/comercial`)
  return lines.join('\n').trim()
}

export async function sendDueBriefings(now = new Date()): Promise<{ sent: number; reason: string }> {
  const { date, hour, weekday } = madridParts(now)
  const startHour = Number(process.env.BRIEFING_HOUR || 8)
  if (hour < startHour || hour >= startHour + 3) return { sent: 0, reason: 'fuera de hora' }
  if ((weekday === 'Sat' || weekday === 'Sun') && process.env.BRIEFING_WEEKENDS !== '1') {
    return { sent: 0, reason: 'fin de semana' }
  }

  const { rows: users } = await query<{ id: number; name: string; whatsapp_phone: string }>(
    `SELECT id, name, whatsapp_phone FROM crm_users
      WHERE active = TRUE AND role = 'comercial'
        AND COALESCE(briefing_whatsapp, FALSE) = TRUE
        AND COALESCE(whatsapp_phone, '') <> ''`
  )
  if (!users.length) return { sent: 0, reason: 'nadie con briefing activado' }

  const { listColdCallCallbacks } = await import('@/lib/coldcall/callbacks')
  const { listConfirmReminders } = await import('@/lib/coldcall/meeting-reminders')
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || ''

  let sent = 0
  for (const u of users) {
    const scope = { mode: 'user' as const, userId: u.id }
    const [callbacks, toConfirm] = await Promise.all([
      listColdCallCallbacks(scope, { daysBack: 7, daysAhead: 1 }),
      listConfirmReminders(scope).then((r) => r.filter((m) => !m.confirm_status || m.confirm_status === 'pending')),
    ])
    const text = buildComercialBriefing({ name: u.name, today: date, callbacks, toConfirm, baseUrl })
    const { duplicate } = await enqueueJob(
      'notify.whatsapp',
      { phone: u.whatsapp_phone, text },
      { dedupeKey: `briefing:${u.id}:${date}` }
    )
    if (!duplicate) sent++
  }
  return { sent, reason: sent ? 'enviados' : 'ya enviados hoy' }
}
