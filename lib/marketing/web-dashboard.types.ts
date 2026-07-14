export type WebAlertSeverity = 'info' | 'warning' | 'urgent'

export interface WebDashboardAlert {
  id: string
  severity: WebAlertSeverity
  title: string
  message: string
}

export interface WebTimelinePoint {
  date: string
  label: string
  form: number
  cal: number
  chat: number
}

export interface WebChannelTotals {
  form: number
  cal: number
  chat: number
  total: number
}

export interface WebDashboardMetrics {
  period: string
  totals: WebChannelTotals
  timeline: WebTimelinePoint[]
  alerts: WebDashboardAlert[]
  form_pending: number
  cal_upcoming: number
  cal_upcoming_today: number
  chat_replied: number
  chat_available: boolean
  form_available: boolean
  cal_available: boolean
  pipeline_synced: number
  pipeline_available: boolean
  share_form_pct: number
  share_cal_pct: number
  share_chat_pct: number
  cal_from_form_pct: number | null
}
