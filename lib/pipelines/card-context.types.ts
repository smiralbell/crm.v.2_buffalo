export type PipelineTimelineItem = {
  id: string
  kind: 'origin' | 'channel' | 'meeting_booked' | 'meeting_done' | 'project' | 'capture'
  title: string
  detail?: string | null
  at: string
}

export type PipelineUpcomingMeeting = {
  title: string | null
  start_time: string
  end_time: string | null
  status: string
  source: 'cal_booking'
  calendar_href: string
}

export type PipelineProjectContext = {
  has_any: boolean
  title: string | null
  description: string | null
  mode: 'packaged' | 'custom' | null
  status: string | null
  services: string[]
  setup_eur: number | null
  monthly_eur: number | null
  monthly_label: string | null
  lead_notas: string | null
  onboarding_notes: string | null
  onboarding_summary: string | null
  scope_text: string | null
  last_meeting_summary: string | null
  last_meeting_title: string | null
  retention_excerpt: string | null
  retention_status: string | null
  hrefs: {
    onboarding: string | null
    retencion: string | null
    gestion: string | null
  }
}

export type PipelineCardContext = {
  contact_id: number
  lead_id: number | null
  email: string | null
  telefono: string | null
  origen_principal: string | null
  canal: string | null
  lead_created_at: string | null
  upcoming_meeting: PipelineUpcomingMeeting | null
  timeline: PipelineTimelineItem[]
  proyecto: {
    id: string
    name: string
    status: string
    created_at: string | null
  } | null
  /** Resumen comercial / operativo del proyecto que se está hablando */
  project_context: PipelineProjectContext
}
