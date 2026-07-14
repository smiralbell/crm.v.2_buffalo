export type CalBookingStatus = 'cancelled' | 'accepted' | 'rejected' | 'pending'

export interface CalBookingRow {
  uid: string
  title: string
  status: CalBookingStatus
  start: string
  end: string
  duration: number
  created_at: string
  attendee_name: string | null
  attendee_email: string | null
  location: string | null
  event_type: string | null
  cal_url: string
  lead_id: number | null
  lead_estado: string | null
  lead_origen: string | null
  empresa: string | null
  telefono: string | null
}

export const CAL_BOOKING_STATUS_LABELS: Record<string, string> = {
  accepted: 'Confirmada',
  pending: 'Pendiente',
  cancelled: 'Cancelada',
  rejected: 'Rechazada',
}
