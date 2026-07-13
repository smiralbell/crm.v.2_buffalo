import { prisma } from '@/lib/prisma'
import { getColdCallTeamUserIds } from './scope'

export interface TeamMemberStats {
  user_id: number
  name: string
  role: string
  calls_today: number
  calls_week: number
  calls_total: number
  duration_min: number
  avg_duration_min: number
  interested: number
  meetings: number
  positive_calls: number
  positive_rate: number
  whatsapp_sent: number
  campaigns: number
  last_call_at: string | null
}

export interface ColdCallTeamDashboardData {
  members: TeamMemberStats[]
  calls_by_day: Array<{ date: string; label: string; [seriesKey: string]: number | string }>
  series: { key: string; name: string; user_id: number }[]
  totals: {
    calls_week: number
    duration_min_week: number
    meetings_week: number
  }
}

const LEGACY_ADMIN_ID = 0
const LEGACY_ADMIN_NAME = 'Administrador'

function asNumber(value: unknown): number {
  if (value == null) return 0
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return value
  return Number(value)
}

function memberKey(userId: number): string {
  return `u_${userId}`
}

function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export async function getColdCallTeamDashboard(): Promise<ColdCallTeamDashboardData> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
  const trendStart = new Date(todayStart)
  trendStart.setDate(trendStart.getDate() - 13)

  await getColdCallTeamUserIds()

  const userRows = await prisma.$queryRaw<{ id: number; name: string; role: string }[]>`
    SELECT id, name, role FROM crm_users
    WHERE active = TRUE AND role IN ('admin', 'comercial')
    ORDER BY name ASC
  `

  const memberDirectory = new Map<number, { name: string; role: string }>()
  for (const row of userRows) {
    memberDirectory.set(asNumber(row.id), { name: row.name, role: row.role })
  }
  memberDirectory.set(LEGACY_ADMIN_ID, { name: LEGACY_ADMIN_NAME, role: 'admin' })

  const statsRows = await prisma.$queryRaw<
    {
      user_id: number | null
      calls_today: number
      calls_week: number
      calls_total: number
      duration_sec: number | null
      duration_week_sec: number | null
      interested: number
      meetings: number
      positive_calls: number
      whatsapp_sent: number
      last_call_at: Date | null
      campaigns: number
    }[]
  >`
    WITH attributed AS (
      SELECT
        c.id,
        c.fecha,
        c.duracion,
        c.resultado,
        c.whatsapp_enviado,
        camp.id AS campaign_id,
        COALESCE(
          c.created_by_user_id,
          camp.assigned_to_user_id,
          camp.created_by_user_id,
          CASE
            WHEN camp.assigned_to_user_id IS NULL AND camp.created_by_user_id IS NULL THEN ${LEGACY_ADMIN_ID}
            ELSE NULL
          END
        ) AS user_id
      FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      INNER JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
    )
    SELECT
      a.user_id::int AS user_id,
      COUNT(*) FILTER (WHERE a.fecha >= ${todayStart})::int AS calls_today,
      COUNT(*) FILTER (WHERE a.fecha >= ${weekStart})::int AS calls_week,
      COUNT(*)::int AS calls_total,
      COALESCE(SUM(a.duracion) FILTER (WHERE a.duracion > 0), 0)::int AS duration_sec,
      COALESCE(SUM(a.duracion) FILTER (WHERE a.duracion > 0 AND a.fecha >= ${weekStart}), 0)::int AS duration_week_sec,
      COUNT(*) FILTER (WHERE a.resultado = 'interesado')::int AS interested,
      COUNT(*) FILTER (WHERE a.resultado = 'reunion_agendada')::int AS meetings,
      COUNT(*) FILTER (WHERE a.resultado IN ('interesado', 'reunion_agendada'))::int AS positive_calls,
      COUNT(*) FILTER (WHERE a.whatsapp_enviado IS TRUE)::int AS whatsapp_sent,
      MAX(a.fecha) AS last_call_at,
      COUNT(DISTINCT a.campaign_id)::int AS campaigns
    FROM attributed a
    WHERE a.user_id IS NOT NULL
    GROUP BY a.user_id
  `

  const campaignCounts = await prisma.$queryRaw<{ user_id: number | null; campaigns: number }[]>`
    SELECT
      COALESCE(assigned_to_user_id, created_by_user_id, ${LEGACY_ADMIN_ID})::int AS user_id,
      COUNT(*)::int AS campaigns
    FROM coldcall_campaigns
    WHERE status != 'archived'
    GROUP BY 1
  `

  const campaignMap = new Map<number, number>()
  for (const row of campaignCounts) {
    if (row.user_id == null) continue
    campaignMap.set(asNumber(row.user_id), asNumber(row.campaigns))
  }

  const statsMap = new Map<number, (typeof statsRows)[0]>()
  for (const row of statsRows) {
    if (row.user_id == null) continue
    statsMap.set(asNumber(row.user_id), row)
  }

  const allUserIds = new Set<number>([...statsMap.keys(), ...campaignMap.keys(), LEGACY_ADMIN_ID, ...memberDirectory.keys()])

  const members: TeamMemberStats[] = [...allUserIds]
    .filter((id) => memberDirectory.has(id) || statsMap.has(id) || campaignMap.has(id))
    .map((userId) => {
      const meta = memberDirectory.get(userId) || { name: `Usuario #${userId}`, role: 'comercial' }
      const row = statsMap.get(userId)
      const callsTotal = asNumber(row?.calls_total)
      const durationWeekSec = asNumber(row?.duration_week_sec)
      const durationSec = asNumber(row?.duration_sec)
      const positiveCalls = asNumber(row?.positive_calls)
      return {
        user_id: userId,
        name: meta.name,
        role: meta.role,
        calls_today: asNumber(row?.calls_today),
        calls_week: asNumber(row?.calls_week),
        calls_total: callsTotal,
        duration_min: Math.round(durationWeekSec / 60),
        avg_duration_min:
          callsTotal > 0 && durationSec > 0 ? Math.round((durationSec / callsTotal / 60) * 10) / 10 : 0,
        interested: asNumber(row?.interested),
        meetings: asNumber(row?.meetings),
        positive_calls: positiveCalls,
        positive_rate: callsTotal > 0 ? Math.round((positiveCalls / callsTotal) * 1000) / 10 : 0,
        whatsapp_sent: asNumber(row?.whatsapp_sent),
        campaigns: asNumber(campaignMap.get(userId) ?? row?.campaigns),
        last_call_at: row?.last_call_at?.toISOString() ?? null,
      }
    })
    .sort((a, b) => b.calls_week - a.calls_week || b.duration_min - a.duration_min)

  const trendRows = await prisma.$queryRaw<
    { day: Date; user_id: number | null; calls: number }[]
  >`
    WITH attributed AS (
      SELECT
        c.fecha,
        COALESCE(
          c.created_by_user_id,
          camp.assigned_to_user_id,
          camp.created_by_user_id,
          CASE
            WHEN camp.assigned_to_user_id IS NULL AND camp.created_by_user_id IS NULL THEN ${LEGACY_ADMIN_ID}
            ELSE NULL
          END
        ) AS user_id
      FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      INNER JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
      WHERE c.fecha >= ${trendStart}
    )
    SELECT DATE(fecha) AS day, user_id::int AS user_id, COUNT(*)::int AS calls
    FROM attributed
    WHERE user_id IS NOT NULL
    GROUP BY DATE(fecha), user_id
    ORDER BY day ASC
  `

  const series = members.map((m) => ({
    key: memberKey(m.user_id),
    name: m.name,
    user_id: m.user_id,
  }))

  const dayMap = new Map<string, { date: string; label: string; [k: string]: number | string }>()
  for (let i = 0; i < 14; i++) {
    const d = new Date(trendStart)
    d.setDate(d.getDate() + i)
    const date = d.toISOString().slice(0, 10)
    const point: { date: string; label: string; [k: string]: number | string } = {
      date,
      label: fmtDayLabel(d),
    }
    for (const s of series) point[s.key] = 0
    dayMap.set(date, point)
  }

  for (const row of trendRows) {
    if (row.user_id == null) continue
    const date = new Date(row.day).toISOString().slice(0, 10)
    const point = dayMap.get(date)
    if (!point) continue
    const key = memberKey(asNumber(row.user_id))
    point[key] = (Number(point[key] || 0) + asNumber(row.calls)) as number
  }

  return {
    members,
    calls_by_day: [...dayMap.values()],
    series,
    totals: {
      calls_week: members.reduce((s, m) => s + m.calls_week, 0),
      duration_min_week: members.reduce((s, m) => s + m.duration_min, 0),
      meetings_week: members.reduce((s, m) => s + m.meetings, 0),
    },
  }
}
