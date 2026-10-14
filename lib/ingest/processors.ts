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
import { applyStripePayment, parseStripeEvent } from '@/lib/payments/stripe'
import { processInstantly } from '@/lib/ingest/instantly'
import { processWebForm } from '@/lib/ingest/web-form'
import { processOnboardingForm } from '@/lib/ingest/onboarding-form'
import { processTickets } from '@/lib/ingest/tickets-inbound'
import { processRetell, processWhatsapp } from '@/lib/ingest/whatsapp'
import type { InboundProcessor, InboundProcessorResult } from '@/lib/ingest/types'

export type { InboundProcessor, InboundProcessorResult }

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

async function processStripe(payload: unknown): Promise<InboundProcessorResult> {
  const parsed = parseStripeEvent(payload)
  if (!parsed) return { status: 'ignored', result: { reason: 'unparsed' } }
  return applyStripePayment(parsed)
}

export const INBOUND_PROCESSORS: Record<string, InboundProcessor> = {
  calcom: processCalcom,
  fireflies: processFireflies,
  web_chat: processWebChat,
  stripe: processStripe,
  instantly: processInstantly,
  web_form: processWebForm,
  onboarding_form: processOnboardingForm,
  tickets: processTickets,
  whatsapp: processWhatsapp,
  retell: processRetell,
}
