export interface WebLeadRow {
  id: number
  estado: string | null
  origen_principal: string | null
  created_at: string
  contact: {
    nombre: string | null
    email: string | null
    empresa: string | null
  } | null
}

export interface WebMarketingMetrics {
  period: string
  web_leads: number
  form_submissions: number
  chat_sessions: number
  chat_replied: number
  conversion_form_pct: number | null
  conversion_chat_pct: number | null
  recent_web_leads: WebLeadRow[]
  chat_available: boolean
  form_submissions_available: boolean
  form_submissions_pending: number
  cal_bookings: number
  cal_upcoming: number
  cal_available: boolean
}
