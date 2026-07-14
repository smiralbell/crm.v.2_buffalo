import { createHmac, timingSafeEqual } from 'crypto'
import type { CalBookingStatus } from '@/lib/marketing/cal-bookings.types'

export const DEFAULT_CAL_EVENT_SLUG = 'reunion-agente-llamada'
export const DEFAULT_CAL_LINK = 'buffalo-agencia/reunion-agente-llamada'

export interface CalWebhookBody {
  triggerEvent?: string
  createdAt?: string
  payload?: CalWebhookBookingPayload
  uid?: string
  title?: string
  startTime?: string
  endTime?: string
  type?: string
  eventTypeId?: number
  location?: string
  attendees?: CalWebhookAttendee[]
  metadata?: Record<string, unknown>
  status?: string
}

export interface CalWebhookBookingPayload {
  uid?: string
  title?: string
  startTime?: string
  endTime?: string
  type?: string
  eventTypeId?: number
  location?: string
  attendees?: CalWebhookAttendee[]
  metadata?: Record<string, unknown>
  status?: string
  requiresConfirmation?: boolean
}

export interface CalWebhookAttendee {
  name?: string
  email?: string
}

export interface ParsedCalWebhookBooking {
  uid: string
  trigger_event: string
  title: string
  status: CalBookingStatus
  start_time: string | null
  end_time: string | null
  duration_minutes: number
  attendee_name: string | null
  attendee_email: string | null
  location: string | null
  event_type_slug: string | null
  event_type_id: number | null
  booked_at: string
  payload: CalWebhookBody
}

function getEventSlugFilter(): string {
  return (process.env.CALCOM_EVENT_SLUG?.trim() || DEFAULT_CAL_EVENT_SLUG).toLowerCase()
}

function normalizeCalSignature(header: string): string {
  let value = header.trim()
  if (value.toLowerCase().startsWith('sha256=')) {
    value = value.slice(7)
  }
  return value.toLowerCase()
}

export function verifyCalWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim()
  if (!secret) return true
  if (!signatureHeader?.trim()) return false

  const received = normalizeCalSignature(signatureHeader)
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  if (expected === received) return true

  if (expected.length === received.length) {
    try {
      return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'))
    } catch {
      return false
    }
  }

  return false
}

function resolveBookingPayload(body: CalWebhookBody): CalWebhookBookingPayload {
  if (body.payload && typeof body.payload === 'object') return body.payload
  return body
}

function statusFromTrigger(trigger: string, payload: CalWebhookBookingPayload): CalBookingStatus {
  switch (trigger) {
    case 'BOOKING_CANCELLED':
      return 'cancelled'
    case 'BOOKING_REJECTED':
      return 'rejected'
    case 'BOOKING_REQUESTED':
      return 'pending'
    case 'BOOKING_CREATED':
    case 'BOOKING_RESCHEDULED':
      if (payload.requiresConfirmation) return 'pending'
      if (payload.status === 'pending') return 'pending'
      return 'accepted'
    default:
      return 'accepted'
  }
}

function resolveLocation(payload: CalWebhookBookingPayload): string | null {
  const metadata = payload.metadata
  const videoUrl =
    typeof metadata?.videoCallUrl === 'string'
      ? metadata.videoCallUrl
      : typeof metadata?.videoCallURL === 'string'
        ? metadata.videoCallURL
        : null
  if (videoUrl?.trim()) return videoUrl.trim()

  const loc = payload.location?.trim()
  if (loc?.startsWith('http')) return loc
  return loc || null
}

function durationMinutes(start: string | undefined, end: string | undefined): number {
  if (!start || !end) return 0
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round(ms / 60_000)
}

export function matchesCalEventFilter(payload: CalWebhookBookingPayload): boolean {
  const slugFilter = getEventSlugFilter()
  const eventTypeId = process.env.CALCOM_EVENT_TYPE_ID?.trim()
  if (eventTypeId && payload.eventTypeId != null) {
    return String(payload.eventTypeId) === eventTypeId
  }
  if (!slugFilter) return true
  const slug = payload.type?.trim().toLowerCase()
  return slug === slugFilter
}

export function parseCalWebhookBooking(body: CalWebhookBody): ParsedCalWebhookBooking | null {
  const trigger = body.triggerEvent?.trim() || 'BOOKING_CREATED'
  const payload = resolveBookingPayload(body)
  const uid = payload.uid?.trim()
  if (!uid) return null

  if (!matchesCalEventFilter(payload)) return null

  const attendee = payload.attendees?.[0]
  const start = payload.startTime || null
  const end = payload.endTime || null

  return {
    uid,
    trigger_event: trigger,
    title: payload.title?.trim() || 'Reunión',
    status: statusFromTrigger(trigger, payload),
    start_time: start,
    end_time: end,
    duration_minutes: durationMinutes(start || undefined, end || undefined),
    attendee_name: attendee?.name?.trim() || null,
    attendee_email: attendee?.email?.trim() || null,
    location: resolveLocation(payload),
    event_type_slug: payload.type?.trim() || null,
    event_type_id: payload.eventTypeId ?? null,
    booked_at: body.createdAt || new Date().toISOString(),
    payload: body,
  }
}

export function isCalWebhookRelevantTrigger(trigger: string | undefined): boolean {
  if (!trigger) return false
  return [
    'BOOKING_CREATED',
    'BOOKING_CANCELLED',
    'BOOKING_RESCHEDULED',
    'BOOKING_REJECTED',
    'BOOKING_REQUESTED',
  ].includes(trigger)
}
