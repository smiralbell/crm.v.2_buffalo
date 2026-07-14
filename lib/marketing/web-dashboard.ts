import { query } from '@/lib/db'
import { queryChat } from '@/lib/db-chat'
import { AGENT_CHAT_HISTORY_TABLE } from '@/lib/agent-chat-history'
import { countPendingWebFormSubmissions, isWebFormSubmissionsTableAvailable } from '@/lib/marketing/web-form-submissions'
import { countUpcomingCalBookings, isCalBookingsReady, listCalBookings } from '@/lib/marketing/cal-bookings'
import { listWebFormSubmissions } from '@/lib/marketing/web-form-submissions'
import type { WebDashboardMetrics, WebDashboardAlert, WebTimelinePoint } from '@/lib/marketing/web-dashboard.types'
import { getWebPipelineId, syncAllWebSourcesToPipeline } from '@/lib/pipelines/web'

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

function buildAlerts(input: {
  formPending: number
  calUpcoming: number
  calToday: number
  totals: { form: number; cal: number; chat: number }
  pipelineAvailable: boolean
}): WebDashboardAlert[] {
  const alerts: WebDashboardAlert[] = []

  if (input.formPending > 0) {
    alerts.push({
      id: 'form-pending',
      severity: input.formPending >= 5 ? 'urgent' : 'warning',
      title: `${input.formPending} formulario${input.formPending > 1 ? 's' : ''} sin contactar`,
      message: 'Revisa los envíos del formulario web y marca como contactado.',
    })
  }

  if (input.calToday > 0) {
    alerts.push({
      id: 'cal-today',
      severity: 'info',
      title: `${input.calToday} reunión${input.calToday > 1 ? 'es' : ''} hoy`,
      message: 'Agendas del calendario Cal.com programadas para hoy.',
    })
  }

  if (input.calUpcoming > 0) {
    alerts.push({
      id: 'cal-upcoming',
      severity: 'info',
      title: `${input.calUpcoming} reuniones próximas`,
      message: 'Reservas confirmadas en el calendario web.',
    })
  }

  const total = input.totals.form + input.totals.cal + input.totals.chat
  if (total === 0) {
    alerts.push({
      id: 'no-activity',
      severity: 'info',
      title: 'Sin actividad web en el período',
      message: 'Cuando lleguen formularios, chats o reservas Cal.com aparecerán aquí.',
    })
  } else if (input.totals.cal === 0 && input.totals.form + input.totals.chat >= 3) {
    alerts.push({
      id: 'no-cal',
      severity: 'warning',
      title: 'Tráfico web sin conversiones a calendario',
      message: 'Hay formularios o chats pero ninguna reserva Cal.com este mes.',
    })
  }

  if (!input.pipelineAvailable) {
    alerts.push({
      id: 'no-pipeline',
      severity: 'warning',
      title: 'Pipeline WEB no encontrado',
      message: 'Crea un pipeline llamado WEB con columnas LEAD, CONTACTO y REUNIÓN.',
    })
  }

  return alerts
}

export async function getWebDashboardMetrics(period: string): Promise<WebDashboardMetrics> {
  const pipelineAvailable = !!(await getWebPipelineId())
  const pipelineSynced = pipelineAvailable ? await syncAllWebSourcesToPipeline(period) : 0

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

  return {
    period,
    totals,
    timeline: buildTimeline(period, formByDay, calByDay, chatByDay),
    alerts: buildAlerts({
      formPending,
      calUpcoming,
      calToday,
      totals,
      pipelineAvailable,
    }),
    form_pending: formPending,
    cal_upcoming: calUpcoming,
    cal_upcoming_today: calToday,
    chat_replied: chatReplied,
    chat_available: chatReplied > 0 || totals.chat >= 0,
    form_available: formsOk,
    cal_available: calOk,
    pipeline_synced: pipelineSynced,
    pipeline_available: pipelineAvailable,
    share_form_pct: Math.round((totals.form / totalAll) * 1000) / 10,
    share_cal_pct: Math.round((totals.cal / totalAll) * 1000) / 10,
    share_chat_pct: Math.round((totals.chat / totalAll) * 1000) / 10,
    cal_from_form_pct:
      totals.form > 0 ? Math.round((totals.cal / totals.form) * 1000) / 10 : null,
  }
}
