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
}
