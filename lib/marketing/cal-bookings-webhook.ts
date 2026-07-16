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

/** Solo filtra si CALCOM_EVENT_SLUG o CALCOM_EVENT_TYPE_ID están en el .env. Sin ellos, acepta todos. */
function getEventSlugFilter(): string | null {
  const slug = process.env.CALCOM_EVENT_SLUG?.trim()
  if (!slug || slug === '*' || slug.toLowerCase() === 'all') return null
  return slug.toLowerCase()
}

export function getCalWebhookFilterConfig() {
  return {
    event_slug: getEventSlugFilter(),
    event_type_id: process.env.CALCOM_EVENT_TYPE_ID?.trim() || null,
    default_slug_hint: DEFAULT_CAL_EVENT_SLUG,
  }
}

export type ParseCalWebhookResult =
  | { ok: true; booking: ParsedCalWebhookBooking }
  | { ok: false; reason: string; detail?: Record<string, unknown> }

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

export function matchesCalEventFilter(payload: CalWebhookBookingPayload): {
  match: boolean
  reason?: string
  receivedSlug?: string | null
  receivedEventTypeId?: number | null
} {
  const eventTypeId = process.env.CALCOM_EVENT_TYPE_ID?.trim()
  const slugFilter = getEventSlugFilter()
  const receivedSlug = payload.type?.trim() || null
  const receivedEventTypeId = payload.eventTypeId ?? null

  if (eventTypeId) {
    if (receivedEventTypeId == null) {
      return {
        match: false,
        reason: `filtro CALCOM_EVENT_TYPE_ID=${eventTypeId} pero el payload no trae eventTypeId`,
        receivedSlug,
        receivedEventTypeId,
      }
    }
    if (String(receivedEventTypeId) !== eventTypeId) {
      return {
        match: false,
        reason: `eventTypeId ${receivedEventTypeId} ≠ filtro ${eventTypeId}`,
        receivedSlug,
        receivedEventTypeId,
      }
    }
    return { match: true, receivedSlug, receivedEventTypeId }
  }

  if (!slugFilter) {
    return { match: true, receivedSlug, receivedEventTypeId }
  }

  const slug = receivedSlug?.toLowerCase() || ''
  if (slug === slugFilter) {
    return { match: true, receivedSlug, receivedEventTypeId }
  }

  return {
    match: false,
    reason: `type "${receivedSlug || '(vacío)'}" ≠ filtro CALCOM_EVENT_SLUG="${slugFilter}"`,
    receivedSlug,
    receivedEventTypeId,
  }
}

export function parseCalWebhookBooking(body: CalWebhookBody): ParseCalWebhookResult {
  const trigger = body.triggerEvent?.trim() || 'BOOKING_CREATED'
  const payload = resolveBookingPayload(body)
  const uid = payload.uid?.trim()
  if (!uid) {
    return {
      ok: false,
      reason: 'missing_uid',
      detail: {
        trigger,
        hasPayloadWrapper: !!body.payload,
        payloadKeys: Object.keys(payload || {}),
      },
    }
  }

  const filter = matchesCalEventFilter(payload)
  if (!filter.match) {
    return {
      ok: false,
      reason: 'event_filter',
      detail: {
        trigger,
        uid,
        filter_reason: filter.reason,
        received_slug: filter.receivedSlug,
        received_event_type_id: filter.receivedEventTypeId,
        filter_config: getCalWebhookFilterConfig(),
      },
    }
  }

  const attendee = payload.attendees?.[0]
  const start = payload.startTime || null
  const end = payload.endTime || null

  return {
    ok: true,
    booking: {
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
    },
  }
}

export function isCalWebhookRelevantTrigger(trigger: string | undefined): boolean {
  if (!trigger) return false
  // Ping de prueba de Cal.com
  if (trigger === 'PING' || trigger === 'TEST_EVENT') return false
  return [
    'BOOKING_CREATED',
    'BOOKING_CANCELLED',
    'BOOKING_RESCHEDULED',
    'BOOKING_REJECTED',
    'BOOKING_REQUESTED',
  ].includes(trigger)
}
