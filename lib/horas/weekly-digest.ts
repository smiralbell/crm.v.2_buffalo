import { prisma } from '@/lib/prisma'
import { DEFAULT_SCHEDULE, localDay, workdayMinutes, zonedToUtc } from '@/lib/horas/formula'
import { getHoursReport, type HoursReport } from '@/lib/horas/store'
import { crmPublicBaseUrl } from '@/lib/ops-alerts'

/**
 * Resumen de horas de la semana para los socios (solo a ellos), los viernes a las 18:15.
 * Se manda una vez por semana aunque haya varios procesos.
 */

const SEND_DOW = 5 // viernes
const SEND_MINUTES = 18 * 60 + 15

function madridParts(at: Date): { y: number; m: number; d: number; dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_SCHEDULE.timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    dow: dows.indexOf(get('weekday')) + 1,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/** Lunes 00:00 (hora de Madrid) de la semana de `at`. */
export function weekStart(at: Date): Date {
  const p = madridParts(at)
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d - (p.dow - 1)))
  return zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 0, DEFAULT_SCHEDULE.timeZone)
}

const fmt = (h: number) => h.toLocaleString('es-ES', { maximumFractionDigits: 1 })

/** Texto del resumen (WhatsApp, sin formato). */
export function digestText(report: HoursReport, opts: { from: Date; to: Date; idle: string[]; link: string }): string {
  const tz = DEFAULT_SCHEDULE.timeZone
  const a = opts.from.toLocaleDateString('es-ES', { timeZone: tz, day: 'numeric', month: 'short' })
  const b = new Date(opts.to.getTime() - 1).toLocaleDateString('es-ES', { timeZone: tz, day: 'numeric', month: 'short' })
  const capacity = (workdayMinutes() / 60) * 5
  const total = report.people.reduce((s, p) => s + p.hours, 0)
  const lines = [`⏱️ Horas de la semana (${a} – ${b})`, '', `Equipo: ${fmt(total)} h`]
  if (report.people.length) lines.push('')
  for (const p of report.people) {
    const projects = p.by_project
      .slice(0, 3)
      .map((x) => `${x.name} ${fmt(x.hours)} h`)
      .join(', ')
    lines.push(`• ${p.name}: ${fmt(p.hours)} h (${Math.round((p.hours / capacity) * 100)}%)${projects ? ` — ${projects}` : ''}`)
  }
  if (opts.idle.length) lines.push('', `Sin horas registradas: ${opts.idle.join(', ')}`)
  if (!report.people.length) lines.push('', 'Nadie ha tenido tareas en curso esta semana.')
  lines.push('', `Detalle: ${opts.link}`)
  return lines.join('\n')
}

let ready = false
async function ensureTable(): Promise<void> {
  if (ready) return
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS horas_weekly_digest (week_start DATE PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
  )
  ready = true
}

/** Lo llama el programador cada 15 min: manda el resumen el viernes a partir de las 18:15. */
export async function maybeSendWeeklyHoursDigest(now = new Date()): Promise<boolean> {
  const p = madridParts(now)
  if (p.dow < SEND_DOW || (p.dow === SEND_DOW && p.minutes < SEND_MINUTES)) return false
  if (p.dow > SEND_DOW) return false // si el viernes no estaba encendido, no se manda en fin de semana

  const from = weekStart(now)
  await ensureTable()
  const weekKey = localDay(from, DEFAULT_SCHEDULE.timeZone)
  const claimed = await prisma.$queryRawUnsafe<{ week_start: Date }[]>(
    `INSERT INTO horas_weekly_digest (week_start) VALUES ($1::date) ON CONFLICT DO NOTHING RETURNING week_start`,
    weekKey
  )
  if (!claimed.length) return false

  const report = await getHoursReport(from, now)
  const withHours = new Set(report.people.map((x) => x.user_id).filter((x): x is number => x != null))
  const team = await prisma.$queryRawUnsafe<{ id: number; name: string }[]>(
    `SELECT id, name FROM crm_users WHERE active = TRUE AND role IN ('developer', 'project_manager') ORDER BY name`
  )
  const idle = team.filter((u) => !withHours.has(u.id)).map((u) => u.name)

  const text = digestText(report, { from, to: now, idle, link: `${crmPublicBaseUrl()}/tareas/horas` })
  const { notify } = await import('@/lib/notifications/notify')
  await notify({
    event: 'horas_semana',
    subject: '[CRM] Horas de la semana',
    text,
    url: '/tareas/horas',
    dedupeKey: `horas-semana-${weekKey}`,
  })
  return true
}
