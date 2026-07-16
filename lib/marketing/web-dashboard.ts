import { query } from '@/lib/db'
import { queryChat } from '@/lib/db-chat'
import { AGENT_CHAT_HISTORY_TABLE } from '@/lib/agent-chat-history'
import { countPendingWebFormSubmissions, isWebFormSubmissionsTableAvailable } from '@/lib/marketing/web-form-submissions'
import { countUpcomingCalBookings, isCalBookingsReady, listCalBookings } from '@/lib/marketing/cal-bookings'
import { listWebFormSubmissions } from '@/lib/marketing/web-form-submissions'
import type { WebDashboardMetrics, WebDashboardAlert, WebTimelinePoint } from '@/lib/marketing/web-dashboard.types'
import { getWebPipelineInfo, syncAllWebSourcesToPipeline } from '@/lib/pipelines/web'

export type { WebDashboardMetrics, WebDashboardAlert, WebTimelinePoint } from '@/lib/marketing/web-dashboard.types'

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  return { start, end }
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function buildTimeline(
  period: string,
  formByDay: Record<string, number>,
  calByDay: Record<string, number>,
  chatByDay: Record<string, number>
): WebTimelinePoint[] {
  const { start, end } = periodBounds(period)
  const points: WebTimelinePoint[] = []
  const cursor = new Date(start)

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10)
    points.push({
      date: key,
      label: cursor.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      form: formByDay[key] || 0,
      cal: calByDay[key] || 0,
      chat: chatByDay[key] || 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return points
}

async function countCalBookingsToday(): Promise<number> {
  if (!(await isCalBookingsReady())) return 0
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM cal_bookings
     WHERE start_time::date = CURRENT_DATE
       AND status IN ('accepted', 'pending')`
  )
  return parseInt(result.rows[0]?.count || '0', 10)
}

async function countChatRepliedInPeriod(_period: string): Promise<number> {
  try {
    const { rows } = await queryChat<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM (
         SELECT session_id FROM ${AGENT_CHAT_HISTORY_TABLE}
         GROUP BY session_id
         HAVING BOOL_OR(
           COALESCE(message->>'type', '') IN ('human', 'user')
           OR LOWER(COALESCE(message->>'role', '')) IN ('human', 'user')
           OR COALESCE(message #>> '{id,-1}', '') = 'HumanMessage'
         )
       ) s`,
      []
    )
    return parseInt(rows[0]?.count || '0', 10)
  } catch {
    return 0
  }
}

function isToday(iso: string): boolean {
  return dayKey(iso) === dayKey(new Date().toISOString())
}

function buildAlerts(input: {
  formPending: number
  formsToday: number
  calToday: number
  calBookedToday: number
  calUpcoming: number
  chatReplied: number
  newLeadsToday: number
  period: string
  webPipelineId: string | null
}): WebDashboardAlert[] {
  const alerts: WebDashboardAlert[] = []
  const periodQs = `?period=${encodeURIComponent(input.period)}`

  if (input.newLeadsToday > 0) {
    alerts.push({
      id: 'new-leads',
      severity: 'info',
      title: `${input.newLeadsToday} lead${input.newLeadsToday > 1 ? 's' : ''} nuevo${input.newLeadsToday > 1 ? 's' : ''} hoy`,
      message: 'Entradas web de hoy (formulario o calendario) listas para revisar.',
      href: input.webPipelineId ? `/pipelines/${input.webPipelineId}` : '/pipelines',
    })
  }

  if (input.formPending > 0) {
    alerts.push({
      id: 'form-pending',
      severity: input.formPending >= 3 ? 'urgent' : 'warning',
      title: `${input.formPending} formulario${input.formPending > 1 ? 's' : ''} pendiente${input.formPending > 1 ? 's' : ''} de contactar`,
      message: 'Hay envíos del formulario web sin marcar como contactados.',
      href: `/marketing/web/formularios${periodQs}`,
    })
  }

  if (input.formsToday > 0) {
    alerts.push({
      id: 'forms-today',
      severity: 'info',
      title: `${input.formsToday} formulario${input.formsToday > 1 ? 's' : ''} hoy`,
      message: 'Nuevos envíos recibidos hoy desde la web.',
      href: `/marketing/web/formularios${periodQs}`,
    })
  }

  if (input.calBookedToday > 0) {
    alerts.push({
      id: 'cal-booked-today',
      severity: 'info',
      title: `${input.calBookedToday} reserva${input.calBookedToday > 1 ? 's' : ''} de calendario hoy`,
      message: 'Alguien acaba de agendar en Cal.com.',
      href: `/marketing/web/calendario${periodQs}`,
    })
  }

  if (input.calToday > 0) {
    alerts.push({
      id: 'cal-meetings-today',
      severity: 'warning',
      title: `${input.calToday} reunión${input.calToday > 1 ? 'es' : ''} programada${input.calToday > 1 ? 's' : ''} para hoy`,
      message: 'Revisa hora y enlace de la videollamada.',
      href: `/marketing/web/calendario${periodQs}`,
    })
  }

  if (input.chatReplied > 0) {
    alerts.push({
      id: 'chat-attention',
      severity: 'warning',
      title: `${input.chatReplied} chat${input.chatReplied > 1 ? 's' : ''} con respuesta del visitante`,
      message: 'Revisa el widget: puede haber conversaciones pendientes de seguimiento humano.',
      href: '/marketing/web/chat',
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-clear',
      severity: 'info',
      title: 'Sin alertas pendientes',
      message: 'No hay formularios pendientes ni reuniones urgentes ahora mismo.',
    })
  }

  return alerts.slice(0, 8)
}

export async function getWebDashboardMetrics(period: string): Promise<WebDashboardMetrics> {
  const pipelineInfo = await getWebPipelineInfo()
  const syncResult = pipelineInfo.web_pipeline_id
    ? await syncAllWebSourcesToPipeline(period)
    : { synced: 0, errors: ['Pipeline WEB no encontrado'] }

  const pipelineAvailable = !!pipelineInfo.web_pipeline_id

  const formsOk = await isWebFormSubmissionsTableAvailable()
  const calOk = await isCalBookingsReady()

  const forms = formsOk ? await listWebFormSubmissions(period, 500) : []
  const bookings = calOk
    ? (await listCalBookings(period, 500)).filter(
        (b) => b.status !== 'cancelled' && b.status !== 'rejected'
      )
    : []

  const formByDay: Record<string, number> = {}
  for (const f of forms) {
    const k = dayKey(f.submitted_at)
    formByDay[k] = (formByDay[k] || 0) + 1
  }

  const calByDay: Record<string, number> = {}
  for (const b of bookings) {
    const k = dayKey(b.created_at)
    calByDay[k] = (calByDay[k] || 0) + 1
  }

  const chatReplied = await countChatRepliedInPeriod(period)
  const chatByDay: Record<string, number> = {}
  // Sin fechas en chat DB: repartimos el total en los últimos 7 días del mes para visualización
  if (chatReplied > 0) {
    const timelineDays = buildTimeline(period, {}, {}, {})
    const lastDays = timelineDays.slice(-7)
    const perDay = Math.max(1, Math.round(chatReplied / Math.max(lastDays.length, 1)))
    for (const d of lastDays) {
      chatByDay[d.date] = perDay
    }
  }

  const totals = {
    form: forms.length,
    cal: bookings.length,
    chat: chatReplied,
    total: forms.length + bookings.length + chatReplied,
  }

  const totalAll = totals.total || 1
  const formPending = formsOk ? await countPendingWebFormSubmissions(period) : 0
  const calUpcoming = calOk ? await countUpcomingCalBookings() : 0
  const calToday = calOk ? await countCalBookingsToday() : 0
  const formsToday = forms.filter((f) => isToday(f.submitted_at)).length
  const calBookedToday = bookings.filter((b) => isToday(b.created_at)).length
  const newLeadsToday = formsToday + calBookedToday

  return {
    period,
    totals,
    timeline: buildTimeline(period, formByDay, calByDay, chatByDay),
    alerts: buildAlerts({
      formPending,
      formsToday,
      calToday,
      calBookedToday,
      calUpcoming,
      chatReplied,
      newLeadsToday,
      period,
      webPipelineId: pipelineInfo.web_pipeline_id,
    }),
    form_pending: formPending,
    cal_upcoming: calUpcoming,
    cal_upcoming_today: calToday,
    chat_replied: chatReplied,
    chat_available: chatReplied > 0 || totals.chat >= 0,
    form_available: formsOk,
    cal_available: calOk,
    pipeline_synced: syncResult.synced,
    pipeline_available: pipelineAvailable,
    pipeline_errors: syncResult.errors,
    web_pipeline_id: pipelineInfo.web_pipeline_id,
    web_pipeline_name: pipelineInfo.web_pipeline_name,
    web_stages: pipelineInfo.web_stages,
    all_pipelines: pipelineInfo.all_pipelines,
    share_form_pct: Math.round((totals.form / totalAll) * 1000) / 10,
    share_cal_pct: Math.round((totals.cal / totalAll) * 1000) / 10,
    share_chat_pct: Math.round((totals.chat / totalAll) * 1000) / 10,
    cal_from_form_pct:
      totals.form > 0 ? Math.round((totals.cal / totals.form) * 1000) / 10 : null,
  }
}
