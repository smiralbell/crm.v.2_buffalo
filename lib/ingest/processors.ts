/**
 * Procesadores de la ingesta unificada: uno por fuente. Reciben el payload crudo guardado
 * en inbound_events y hacen el trabajo que antes vivía dentro de cada webhook.
 * Si lanzan error, el evento queda «failed» y el worker lo reintenta.
 */
import {
  isCalWebhookRelevantTrigger,
  parseCalWebhookBooking,
  type CalWebhookBody,
} from '@/lib/marketing/cal-bookings-webhook'
import { upsertCalBookingFromWebhook } from '@/lib/marketing/cal-bookings'
import { syncCalBookingToWebPipeline } from '@/lib/pipelines/web'
import {
  isFirefliesPrematureEvent,
  isFirefliesTranscriptReadyEvent,
  parseFirefliesWebhookPayload,
} from '@/lib/integrations/fireflies/client'
import { syncFirefliesMeetingById } from '@/lib/integrations/fireflies/sync'
import { processWebChat } from '@/lib/inbox/web-chat'

export type InboundProcessorResult = {
  status: 'processed' | 'ignored'
  result?: Record<string, unknown>
}

export type InboundProcessor = (payload: unknown) => Promise<InboundProcessorResult>

async function processCalcom(payload: unknown): Promise<InboundProcessorResult> {
  const body = payload as CalWebhookBody
  const trigger = body?.triggerEvent?.trim()
  if (!trigger || trigger === 'PING' || trigger === 'TEST_EVENT') {
    return { status: 'ignored', result: { reason: 'ping', trigger: trigger || null } }
  }
  if (!isCalWebhookRelevantTrigger(trigger)) {
    return { status: 'ignored', result: { reason: 'unsupported_trigger', trigger } }
  }
  const parsed = parseCalWebhookBooking(body)
  if (!parsed.ok) {
    return { status: 'ignored', result: { reason: parsed.reason, detail: parsed.detail } }
  }
  const booking = parsed.booking
  await upsertCalBookingFromWebhook(booking)
  const cardId = await syncCalBookingToWebPipeline({
    uid: booking.uid,
    attendee_name: booking.attendee_name,
    attendee_email: booking.attendee_email,
    title: booking.title,
    start: booking.start_time,
  })
  return {
    status: 'processed',
    result: {
      uid: booking.uid,
      trigger: booking.trigger_event,
      status: booking.status,
      attendee_email: booking.attendee_email,
      event_type_slug: booking.event_type_slug,
      pipeline_card_id: cardId ?? null,
    },
  }
}

async function processFireflies(payload: unknown): Promise<InboundProcessorResult> {
  const { event, meetingId } = parseFirefliesWebhookPayload(payload)
  if (!meetingId) return { status: 'ignored', result: { reason: 'ping', event: event || null } }
  if (isFirefliesPrematureEvent(event) || (event && !isFirefliesTranscriptReadyEvent(event))) {
    return { status: 'ignored', result: { reason: 'event_not_ready', event } }
  }
  const row = await syncFirefliesMeetingById(meetingId)
  return {
    status: 'processed',
    result: {
      fireflies_id: row.fireflies_id,
      lead_id: row.lead_id,
      contact_id: row.contact_id,
      status: row.status,
      match_reason: row.match_reason,
      has_transcript: Boolean(row.transcript),
      has_summary: Boolean(row.summary_overview),
    },
  }
}

export const INBOUND_PROCESSORS: Record<string, InboundProcessor> = {
  calcom: processCalcom,
  fireflies: processFireflies,
  web_chat: processWebChat,
}
