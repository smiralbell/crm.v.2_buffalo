import { prisma } from '@/lib/prisma'
import { outcomeLabel, stageLabel } from './lead-table'
import type { ColdCallScope } from './scope'
import { getScopeFilterParams } from './scope'

export interface ColdCallDashboardData {
  kpis: {
    campaigns: number
    active_campaigns: number
    total_leads: number
    total_calls: number
    calls_today: number
    calls_this_week: number
    calls_last_week: number
    week_change_pct: number
    interested_total: number
    meetings_total: number
    meetings_this_week: number
    interested_this_week: number
    conversion_rate: number
    interest_rate: number
    contact_rate: number
    avg_duration_min: number
    avg_duration_interested_min: number
    leads_in_queue: number
    leads_contacted: number
    positive_leads: number
    callback_leads: number
  }
  insights: {
    best_hour: number | null
    best_hour_label: string | null
    best_hour_rate: number
    best_weekday: string | null
    best_weekday_rate: number
  }
  calls_by_day: { date: string; label: string; calls: number; interested: number; meetings: number }[]
  calls_by_month: {
    month: string
    label: string
    calls: number
    interested: number
    meetings: number
    avg_duration_min: number
  }[]
  calls_by_hour: {
    hour: number
    label: string
    calls: number
    positive: number
    rate: number
  }[]
  weekday_activity: { day: string; calls: number; positive: number; rate: number }[]
  outcomes: { outcome: string; label: string; count: number }[]
  stages: { stage: string; label: string; count: number }[]
  campaigns: {
    id: number
    name: string
    status: string
    total_leads: number
    in_queue: number
    calls: number
    interested: number
    meetings: number
    conversion: number
    last_call_at: string | null
  }[]
  alerts: ColdCallAlert[]
  recent_calls: {
    id: number
    fecha: string
    resultado: string
    duracion: number | null
    notas: string | null
    lead_nombre: string
    campaign_name: string | null
    campaign_id: number | null
  }[]
}

export type ColdCallAlertType =
  | 'reunion_hoy'
  | 'reunion_proxima'
  | 'llamar_hoy'
  | 'llamar_atrasado'
  | 'callback_pendiente'

export type ColdCallAlertPriority = 'high' | 'medium' | 'low'

export interface ColdCallAlert {
  id: string
  type: ColdCallAlertType
  priority: ColdCallAlertPriority
  title: string
  message: string
  lead_id: number | null
  campaign_id: number | null
  action_href: string | null
  action_label: string | null
  at: string | null
}

const OUTCOME_ORDER = [
  'reunion_agendada',
  'interesado',
  'llamar_tarde',
  'sin_respuesta',
  'buzon_voz',
  'no_interesado',
  'no_contactar',
  'numero_erroneo',
]

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!m || m < 1 || m > 12) return ym
  return `${MONTH_LABELS[m - 1]} ${String(y).slice(2)}`
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function pickBestHour(
  rows: { hour: number; calls: number; positive: number }[]
): { hour: number | null; rate: number } {
  const eligible = rows.filter((r) => r.calls >= 3)
  if (!eligible.length) {
    const top = [...rows].sort((a, b) => b.calls - a.calls)[0]
    if (!top || top.calls === 0) return { hour: null, rate: 0 }
    return { hour: top.hour, rate: Math.round((top.positive / top.calls) * 100) }
  }
  const best = [...eligible].sort((a, b) => {
    const rateA = a.positive / a.calls
    const rateB = b.positive / b.calls
    if (rateB !== rateA) return rateB - rateA
    return b.calls - a.calls
  })[0]
  return { hour: best.hour, rate: Math.round((best.positive / best.calls) * 100) }
}

function pickBestWeekday(
  rows: { day: string; calls: number; positive: number }[]
): { day: string | null; rate: number } {
  const eligible = rows.filter((r) => r.calls >= 3)
  if (!eligible.length) {
    const top = [...rows].sort((a, b) => b.calls - a.calls)[0]
    if (!top || top.calls === 0) return { day: null, rate: 0 }
    return { day: top.day, rate: Math.round((top.positive / top.calls) * 100) }
  }
  const best = [...eligible].sort((a, b) => {
    const rateA = a.positive / a.calls
    const rateB = b.positive / b.calls
    if (rateB !== rateA) return rateB - rateA
    return b.calls - a.calls
  })[0]
  return { day: best.day, rate: Math.round((best.positive / best.calls) * 100) }
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function firstName(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre
}

function buildAlerts(
  rows: {
    id: number
    nombre: string
    stage: string
    estado: string
    campaign_id: number | null
    campaign_name: string | null
    next_retry_at: Date | null
    reunion_fecha: Date | null
    last_result: string | null
  }[],
  now: Date,
  todayStart: Date
): ColdCallAlert[] {
  const todayEnd = new Date(todayStart)
  todayEnd.setHours(23, 59, 59, 999)
  const tomorrowEnd = new Date(todayEnd)
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)

  const alerts: ColdCallAlert[] = []
  const seen = new Set<string>()

  const push = (alert: ColdCallAlert) => {
    if (seen.has(alert.id)) return
    seen.add(alert.id)
    alerts.push(alert)
  }

  for (const row of rows) {
    const name = firstName(row.nombre)
    const href =
      row.campaign_id != null
        ? `/coldcalling/campanas/${row.campaign_id}/llamadas?leadId=${row.id}`
        : null

    const meetingAt = row.reunion_fecha ? new Date(row.reunion_fecha) : null
    const retryAt = row.next_retry_at ? new Date(row.next_retry_at) : null
    const isCallback =
      row.stage === 'volver_a_llamar' ||
      row.estado === 'llamar_tarde' ||
      row.last_result === 'llamar_tarde'
    const isMeeting =
      row.stage === 'reunion_agendada' ||
      row.estado === 'reunion_agendada' ||
      row.last_result === 'reunion_agendada'

    if (meetingAt && meetingAt >= todayStart && meetingAt <= todayEnd) {
      push({
        id: `reunion-hoy-${row.id}`,
        type: 'reunion_hoy',
        priority: 'high',
        title: `Reunión hoy con ${name}`,
        message: `A las ${fmtTime(meetingAt)}${row.campaign_name ? ` · ${row.campaign_name}` : ''}`,
        lead_id: row.id,
        campaign_id: row.campaign_id,
        action_href: href,
        action_label: 'Ver lead',
        at: meetingAt.toISOString(),
      })
    } else if (meetingAt && meetingAt > todayEnd && meetingAt <= tomorrowEnd) {
      push({
        id: `reunion-prox-${row.id}`,
        type: 'reunion_proxima',
        priority: 'medium',
        title: `Reunión mañana con ${name}`,
        message: `${fmtShortDate(meetingAt)}${row.campaign_name ? ` · ${row.campaign_name}` : ''}`,
        lead_id: row.id,
        campaign_id: row.campaign_id,
        action_href: href,
        action_label: 'Ver lead',
        at: meetingAt.toISOString(),
      })
    } else if (isMeeting && meetingAt && meetingAt > tomorrowEnd) {
      push({
        id: `reunion-fut-${row.id}`,
        type: 'reunion_proxima',
        priority: 'low',
        title: `Reunión agendada: ${name}`,
        message: `${fmtShortDate(meetingAt)}${row.campaign_name ? ` · ${row.campaign_name}` : ''}`,
        lead_id: row.id,
        campaign_id: row.campaign_id,
        action_href: href,
        action_label: 'Ver lead',
        at: meetingAt.toISOString(),
      })
    }

    if (retryAt && retryAt < now) {
      push({
        id: `retry-overdue-${row.id}`,
        type: 'llamar_atrasado',
        priority: 'high',
        title: `Llamada atrasada: ${name}`,
        message: `Debías llamar el ${fmtShortDate(retryAt)}${row.campaign_name ? ` · ${row.campaign_name}` : ''}`,
        lead_id: row.id,
        campaign_id: row.campaign_id,
        action_href: href,
        action_label: 'Llamar ahora',
        at: retryAt.toISOString(),
      })
    } else if (retryAt && retryAt >= todayStart && retryAt <= todayEnd) {
      push({
        id: `retry-today-${row.id}`,
        type: 'llamar_hoy',
        priority: 'medium',
        title: `Llamar hoy a ${name}`,
        message: `Programado a las ${fmtTime(retryAt)}${row.campaign_name ? ` · ${row.campaign_name}` : ''}`,
        lead_id: row.id,
        campaign_id: row.campaign_id,
        action_href: href,
        action_label: 'Llamar',
        at: retryAt.toISOString(),
      })
    }

    if (isCallback && meetingAt && meetingAt < now && !seen.has(`retry-overdue-${row.id}`)) {
      push({
        id: `callback-overdue-${row.id}`,
        type: 'llamar_atrasado',
        priority: 'high',
        title: `Se te pasó llamar a ${name}`,
        message: `Quedó pendiente desde el ${fmtShortDate(meetingAt)}${row.campaign_name ? ` · ${row.campaign_name}` : ''}`,
        lead_id: row.id,
        campaign_id: row.campaign_id,
        action_href: href,
        action_label: 'Llamar ahora',
        at: meetingAt.toISOString(),
      })
    } else if (
      isCallback &&
      meetingAt &&
      meetingAt >= todayStart &&
      meetingAt <= todayEnd &&
      !seen.has(`retry-today-${row.id}`)
    ) {
      push({
        id: `callback-today-${row.id}`,
        type: 'llamar_hoy',
        priority: 'medium',
        title: `Tienes que llamar a ${name}`,
        message: `Callback a las ${fmtTime(meetingAt)}${row.campaign_name ? ` · ${row.campaign_name}` : ''}`,
        lead_id: row.id,
        campaign_id: row.campaign_id,
        action_href: href,
        action_label: 'Llamar',
        at: meetingAt.toISOString(),
      })
    } else if (isCallback && !meetingAt && !retryAt) {
      push({
        id: `callback-pend-${row.id}`,
        type: 'callback_pendiente',
        priority: 'low',
        title: `Callback pendiente: ${name}`,
        message: `Marcado como "llamar más tarde"${row.campaign_name ? ` · ${row.campaign_name}` : ''}`,
        lead_id: row.id,
        campaign_id: row.campaign_id,
        action_href: href,
        action_label: 'Llamar',
        at: null,
      })
    }
  }

  const priorityOrder: Record<ColdCallAlertPriority, number> = { high: 0, medium: 1, low: 2 }
  return alerts
    .sort((a, b) => {
      const p = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (p !== 0) return p
      if (a.at && b.at) return new Date(a.at).getTime() - new Date(b.at).getTime()
      if (a.at) return -1
      if (b.at) return 1
      return 0
    })
    .slice(0, 15)
}

export async function getColdCallDashboard(scope: ColdCallScope): Promise<ColdCallDashboardData> {
  const { userId: scopeUserId, teamIds: scopeTeamIds, legacyAdmin } = getScopeFilterParams(scope)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
  const lastWeekStart = new Date(weekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  const thirtyDaysAgo = new Date(todayStart)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)

  const [
    campaignCounts,
    leadKpis,
    callKpis,
    avgDuration,
    interestedAvgDuration,
    callsByDayRows,
    callsByMonthRows,
    callsByHourRows,
    weekdayRows,
    outcomeRows,
    stageRows,
    campaignRows,
    alertCandidateRows,
    recentCallRows,
  ] = await Promise.all([
    prisma.$queryRaw<{ total: number; active: number }[]>`
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active
      FROM coldcall_campaigns c
      WHERE (
        (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
        OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
          c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
          OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
          OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        ))
      )
    `,
    prisma.$queryRaw<
      {
        total_leads: number
        in_queue: number
        contacted: number
        interested: number
        meetings: number
        positive_leads: number
        callback_leads: number
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total_leads,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND do_not_call = FALSE
            AND stage IN ('nuevo', 'en_cola', 'volver_a_llamar')
        )::int AS in_queue,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND id IN (SELECT DISTINCT prospect_id FROM coldcall_calls)
        )::int AS contacted,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND stage IN ('interesado_info_enviada', 'reunion_agendada')
        )::int AS interested,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND stage = 'reunion_agendada'
        )::int AS meetings,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND (
            stage IN ('interesado_info_enviada', 'reunion_agendada')
            OR estado IN ('interesado', 'reunion_agendada', 'llamar_tarde')
          )
        )::int AS positive_leads,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND (stage = 'volver_a_llamar' OR estado = 'llamar_tarde')
        )::int AS callback_leads
      FROM coldcall_prospects p
      WHERE p.campaign_id IN (
        SELECT id FROM coldcall_campaigns c
        WHERE (
          (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
          OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
            c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
            OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
            OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          ))
        )
      )
    `,
    prisma.$queryRaw<
      {
        total_calls: number
        calls_today: number
        calls_this_week: number
        calls_last_week: number
        interested_total: number
        meetings_total: number
        meetings_this_week: number
        interested_this_week: number
        positive_total: number
      }[]
    >`
      SELECT
        COUNT(*)::int AS total_calls,
        COUNT(*) FILTER (WHERE fecha >= ${todayStart})::int AS calls_today,
        COUNT(*) FILTER (WHERE fecha >= ${weekStart})::int AS calls_this_week,
        COUNT(*) FILTER (WHERE fecha >= ${lastWeekStart} AND fecha < ${weekStart})::int AS calls_last_week,
        COUNT(*) FILTER (WHERE resultado = 'interesado')::int AS interested_total,
        COUNT(*) FILTER (WHERE resultado = 'reunion_agendada')::int AS meetings_total,
        COUNT(*) FILTER (WHERE resultado = 'reunion_agendada' AND fecha >= ${weekStart})::int AS meetings_this_week,
        COUNT(*) FILTER (WHERE resultado = 'interesado' AND fecha >= ${weekStart})::int AS interested_this_week,
        COUNT(*) FILTER (WHERE resultado IN ('interesado', 'reunion_agendada'))::int AS positive_total
      FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      WHERE p.campaign_id IN (
        SELECT id FROM coldcall_campaigns c
        WHERE (
          (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
          OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
            c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
            OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
            OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          ))
        )
      )
    `,
    prisma.$queryRaw<{ avg_sec: number | null }[]>`
      SELECT AVG(c.duracion)::float AS avg_sec FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      WHERE c.duracion IS NOT NULL AND c.duracion > 0
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
    `,
    prisma.$queryRaw<{ avg_sec: number | null }[]>`
      SELECT AVG(c.duracion)::float AS avg_sec FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      WHERE c.duracion IS NOT NULL AND c.duracion > 0
        AND c.resultado IN ('interesado', 'reunion_agendada')
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
    `,
    prisma.$queryRaw<{ day: Date; calls: number; interested: number; meetings: number }[]>`
      SELECT DATE(c.fecha) AS day, COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE c.resultado = 'interesado')::int AS interested,
        COUNT(*) FILTER (WHERE c.resultado = 'reunion_agendada')::int AS meetings
      FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      WHERE c.fecha >= ${thirtyDaysAgo}
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
      GROUP BY DATE(c.fecha) ORDER BY day ASC
    `,
    prisma.$queryRaw<
      { month: string; calls: number; interested: number; meetings: number; avg_sec: number | null }[]
    >`
      SELECT
        TO_CHAR(DATE_TRUNC('month', c.fecha), 'YYYY-MM') AS month,
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE c.resultado = 'interesado')::int AS interested,
        COUNT(*) FILTER (WHERE c.resultado = 'reunion_agendada')::int AS meetings,
        AVG(c.duracion) FILTER (WHERE c.duracion > 0)::float AS avg_sec
      FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      WHERE c.fecha >= ${twelveMonthsAgo}
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
      GROUP BY DATE_TRUNC('month', c.fecha)
      ORDER BY month ASC
    `,
    prisma.$queryRaw<{ hour: number; calls: number; positive: number }[]>`
      SELECT
        EXTRACT(HOUR FROM c.fecha)::int AS hour,
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE c.resultado IN ('interesado', 'reunion_agendada'))::int AS positive
      FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      WHERE c.fecha >= ${thirtyDaysAgo}
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
      GROUP BY EXTRACT(HOUR FROM c.fecha) ORDER BY hour ASC
    `,
    prisma.$queryRaw<{ dow: number; calls: number; positive: number }[]>`
      SELECT
        EXTRACT(DOW FROM c.fecha)::int AS dow,
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE c.resultado IN ('interesado', 'reunion_agendada'))::int AS positive
      FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      WHERE c.fecha >= ${thirtyDaysAgo}
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
      GROUP BY EXTRACT(DOW FROM c.fecha) ORDER BY dow ASC
    `,
    prisma.$queryRaw<{ resultado: string; count: number }[]>`
      SELECT c.resultado, COUNT(*)::int AS count FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      WHERE p.campaign_id IN (
        SELECT id FROM coldcall_campaigns c
        WHERE (
          (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
          OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
            c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
            OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
            OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
          ))
        )
      )
      GROUP BY c.resultado ORDER BY count DESC
    `,
    prisma.$queryRaw<{ stage: string; count: number }[]>`
      SELECT
        CASE
          WHEN stage IN ('interesado_info_enviada', 'reunion_agendada', 'no_interesado', 'volver_a_llamar', 'descartado_numero_erroneo') THEN stage
          WHEN estado IS NOT NULL AND estado NOT IN ('pendiente', 'nuevo') THEN estado
          ELSE COALESCE(NULLIF(stage, ''), 'nuevo')
        END AS stage,
        COUNT(*)::int AS count
      FROM coldcall_prospects p
      WHERE p.deleted_at IS NULL
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
      GROUP BY 1 ORDER BY count DESC
    `,
    prisma.$queryRaw<
      {
        id: number
        name: string
        status: string
        total_leads: number
        in_queue: number
        calls: number
        interested: number
        meetings: number
        last_call_at: Date | null
      }[]
    >`
      SELECT c.id, c.name, c.status,
        COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS total_leads,
        COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL AND p.do_not_call = FALSE AND p.stage IN ('nuevo', 'en_cola', 'volver_a_llamar'))::int AS in_queue,
        COALESCE(call_stats.calls, 0)::int AS calls,
        COALESCE(call_stats.interested, 0)::int AS interested,
        COALESCE(call_stats.meetings, 0)::int AS meetings,
        call_stats.last_call_at
      FROM coldcall_campaigns c
      LEFT JOIN coldcall_prospects p ON p.campaign_id = c.id
      LEFT JOIN LATERAL (
        SELECT COUNT(cc.id)::int AS calls,
          COUNT(cc.id) FILTER (WHERE cc.resultado = 'interesado')::int AS interested,
          COUNT(cc.id) FILTER (WHERE cc.resultado = 'reunion_agendada')::int AS meetings,
          MAX(cc.fecha) AS last_call_at
        FROM coldcall_calls cc
        INNER JOIN coldcall_prospects pp ON pp.id = cc.prospect_id
        WHERE pp.campaign_id = c.id AND pp.deleted_at IS NULL
      ) call_stats ON TRUE
      WHERE (
        (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
        OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
          c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
          OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
          OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        ))
      )
      GROUP BY c.id, c.name, c.status, call_stats.calls, call_stats.interested, call_stats.meetings, call_stats.last_call_at
      ORDER BY meetings DESC, interested DESC, calls DESC, c.name ASC
    `,
    prisma.$queryRaw<
      {
        id: number
        nombre: string
        stage: string
        estado: string
        campaign_id: number | null
        campaign_name: string | null
        next_retry_at: Date | null
        reunion_fecha: Date | null
        last_result: string | null
      }[]
    >`
      SELECT
        p.id,
        p.nombre,
        COALESCE(p.stage, 'nuevo') AS stage,
        COALESCE(p.estado, 'pendiente') AS estado,
        camp.id AS campaign_id,
        camp.name AS campaign_name,
        p.next_retry_at,
        COALESCE(lc.reunion_fecha, p.next_retry_at) AS reunion_fecha,
        lc.resultado AS last_result
      FROM coldcall_prospects p
      LEFT JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
      LEFT JOIN LATERAL (
        SELECT resultado, reunion_fecha FROM coldcall_calls
        WHERE prospect_id = p.id ORDER BY fecha DESC LIMIT 1
      ) lc ON TRUE
      WHERE p.deleted_at IS NULL
        AND p.do_not_call = FALSE
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
        AND (
          p.stage IN ('reunion_agendada', 'volver_a_llamar', 'interesado_info_enviada')
          OR p.estado IN ('reunion_agendada', 'llamar_tarde', 'interesado')
          OR p.next_retry_at IS NOT NULL
          OR lc.reunion_fecha IS NOT NULL
        )
      ORDER BY p.next_retry_at ASC NULLS LAST, lc.reunion_fecha ASC NULLS LAST
      LIMIT 60
    `,
    prisma.$queryRaw<
      {
        id: number
        fecha: Date
        resultado: string
        duracion: number | null
        notas: string | null
        lead_nombre: string
        campaign_name: string | null
        campaign_id: number | null
      }[]
    >`
      SELECT c.id, c.fecha, c.resultado, c.duracion, c.notas,
        p.nombre AS lead_nombre, camp.name AS campaign_name, camp.id AS campaign_id
      FROM coldcall_calls c
      INNER JOIN coldcall_prospects p ON p.id = c.prospect_id AND p.deleted_at IS NULL
      LEFT JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
      WHERE c.resultado IN ('interesado', 'reunion_agendada', 'llamar_tarde')
        AND p.campaign_id IN (
          SELECT id FROM coldcall_campaigns c
          WHERE (
            (${legacyAdmin} IS TRUE AND c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NOT NULL AND (c.assigned_to_user_id = ${scopeUserId} OR c.created_by_user_id = ${scopeUserId}))
            OR (${legacyAdmin} IS NOT TRUE AND ${scopeUserId}::int IS NULL AND (
              c.assigned_to_user_id = ANY(${scopeTeamIds}::int[])
              OR c.created_by_user_id = ANY(${scopeTeamIds}::int[])
              OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
            ))
          )
        )
      ORDER BY c.fecha DESC
      LIMIT 2
    `,
  ])

  const cc = campaignCounts[0] ?? { total: 0, active: 0 }
  const lk = leadKpis[0] ?? {
    total_leads: 0,
    in_queue: 0,
    contacted: 0,
    interested: 0,
    meetings: 0,
    positive_leads: 0,
    callback_leads: 0,
  }
  const ck = callKpis[0] ?? {
    total_calls: 0,
    calls_today: 0,
    calls_this_week: 0,
    calls_last_week: 0,
    interested_total: 0,
    meetings_total: 0,
    meetings_this_week: 0,
    interested_this_week: 0,
    positive_total: 0,
  }

  const dayMap = new Map(
    callsByDayRows.map((r) => [
      r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      r,
    ])
  )
  const calls_by_day: ColdCallDashboardData['calls_by_day'] = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    const row = dayMap.get(key)
    calls_by_day.push({
      date: key,
      label: fmtDayLabel(d),
      calls: row?.calls ?? 0,
      interested: row?.interested ?? 0,
      meetings: row?.meetings ?? 0,
    })
  }

  const monthMap = new Map(callsByMonthRows.map((r) => [r.month, r]))
  const calls_by_month: ColdCallDashboardData['calls_by_month'] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = monthMap.get(key)
    calls_by_month.push({
      month: key,
      label: fmtMonthLabel(key),
      calls: row?.calls ?? 0,
      interested: row?.interested ?? 0,
      meetings: row?.meetings ?? 0,
      avg_duration_min: row?.avg_sec ? Math.round(row.avg_sec / 60) : 0,
    })
  }

  const calls_by_hour = Array.from({ length: 24 }, (_, hour) => {
    const row = callsByHourRows.find((r) => r.hour === hour)
    const calls = row?.calls ?? 0
    const positive = row?.positive ?? 0
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      calls,
      positive,
      rate: calls > 0 ? Math.round((positive / calls) * 100) : 0,
    }
  })

  const dowMap = new Map(weekdayRows.map((r) => [r.dow, r]))
  const weekday_activity = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const row = dowMap.get(dow)
    const calls = row?.calls ?? 0
    const positive = row?.positive ?? 0
    return {
      day: DOW_LABELS[dow],
      calls,
      positive,
      rate: calls > 0 ? Math.round((positive / calls) * 100) : 0,
    }
  })

  const bestHour = pickBestHour(callsByHourRows)
  const bestDay = pickBestWeekday(
    weekday_activity.map((w) => ({ day: w.day, calls: w.calls, positive: w.positive }))
  )

  const outcomeMap = new Map(outcomeRows.map((r) => [r.resultado, r.count]))
  const outcomes = OUTCOME_ORDER.filter((o) => outcomeMap.has(o))
    .concat(outcomeRows.map((r) => r.resultado).filter((o) => !OUTCOME_ORDER.includes(o)))
    .map((outcome) => ({
      outcome,
      label: outcomeLabel(outcome),
      count: outcomeMap.get(outcome) ?? 0,
    }))

  const stages = stageRows.map((r) => ({
    stage: r.stage,
    label: stageLabel(r.stage),
    count: r.count,
  }))

  const campaigns = campaignRows.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    total_leads: c.total_leads,
    in_queue: c.in_queue,
    calls: c.calls,
    interested: c.interested,
    meetings: c.meetings,
    conversion: c.calls > 0 ? Math.round((c.meetings / c.calls) * 100) : 0,
    last_call_at: c.last_call_at ? c.last_call_at.toISOString() : null,
  }))

  const alerts = buildAlerts(alertCandidateRows, now, todayStart)

  const recent_calls = recentCallRows.map((r) => ({
    id: r.id,
    fecha: r.fecha instanceof Date ? r.fecha.toISOString() : String(r.fecha),
    resultado: r.resultado,
    duracion: r.duracion,
    notas: r.notas,
    lead_nombre: r.lead_nombre,
    campaign_name: r.campaign_name,
    campaign_id: r.campaign_id,
  }))

  const avgSec = avgDuration[0]?.avg_sec ?? 0
  const avgInterestedSec = interestedAvgDuration[0]?.avg_sec ?? 0
  const totalLeads = lk.total_leads || 0

  return {
    kpis: {
      campaigns: cc.total,
      active_campaigns: cc.active,
      total_leads: totalLeads,
      total_calls: ck.total_calls,
      calls_today: ck.calls_today,
      calls_this_week: ck.calls_this_week,
      calls_last_week: ck.calls_last_week,
      week_change_pct: pctChange(ck.calls_this_week, ck.calls_last_week),
      interested_total: ck.interested_total,
      meetings_total: ck.meetings_total,
      meetings_this_week: ck.meetings_this_week,
      interested_this_week: ck.interested_this_week,
      conversion_rate:
        ck.total_calls > 0 ? Math.round((ck.meetings_total / ck.total_calls) * 100) : 0,
      interest_rate:
        ck.total_calls > 0 ? Math.round((ck.positive_total / ck.total_calls) * 100) : 0,
      contact_rate: totalLeads > 0 ? Math.round((lk.contacted / totalLeads) * 100) : 0,
      avg_duration_min: avgSec > 0 ? Math.round(avgSec / 60) : 0,
      avg_duration_interested_min: avgInterestedSec > 0 ? Math.round(avgInterestedSec / 60) : 0,
      leads_in_queue: lk.in_queue,
      leads_contacted: lk.contacted,
      positive_leads: lk.positive_leads,
      callback_leads: lk.callback_leads,
    },
    insights: {
      best_hour: bestHour.hour,
      best_hour_label: bestHour.hour != null ? `${String(bestHour.hour).padStart(2, '0')}:00` : null,
      best_hour_rate: bestHour.rate,
      best_weekday: bestDay.day,
      best_weekday_rate: bestDay.rate,
    },
    calls_by_day,
    calls_by_month,
    calls_by_hour,
    weekday_activity,
    outcomes,
    stages,
    campaigns,
    alerts,
    recent_calls,
  }
}
