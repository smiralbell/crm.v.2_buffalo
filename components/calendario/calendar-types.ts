export type CrmProjectLink = {
  id: string
  name: string
  status: string
  es_buffalo: boolean
  href: string
}

export type CrmLink = {
  match: 'high' | 'medium' | 'low'
  reason: string
  source: 'email' | 'coldcall' | 'cal_booking' | 'lead'
  lead_id: number | null
  prospect_id: number | null
  cal_uid: string | null
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: string | null
  at: string | null
  campaign_name: string | null
  notas: string | null
  lead_href: string | null
  reuniones_href: string | null
  proyectos: CrmProjectLink[]
}

export type CalendarApiEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  htmlLink: string | null
  meetLink: string | null
  allDay: boolean
  start: string
  end: string
  attendees?: { email: string; displayName: string | null; self: boolean }[]
  crm: CrmLink | null
  userNotes?: string | null
}
