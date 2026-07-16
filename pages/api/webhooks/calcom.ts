import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getCalWebhookFilterConfig,
  isCalWebhookRelevantTrigger,
  parseCalWebhookBooking,
  verifyCalWebhookSignature,
  type CalWebhookBody,
} from '@/lib/marketing/cal-bookings-webhook'
import { upsertCalBookingFromWebhook } from '@/lib/marketing/cal-bookings'
import { syncCalBookingToWebPipeline } from '@/lib/pipelines/web'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function logCal(step: string, data?: Record<string, unknown>) {
  console.log(`[webhooks/calcom] ${step}`, data ? JSON.stringify(data) : '')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let rawBody: string
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    console.error('[webhooks/calcom] body read error', err)
    return res.status(400).json({ error: 'Invalid body' })
  }

  const signature = req.headers['x-cal-signature-256'] as string | undefined
  if (!verifyCalWebhookSignature(rawBody, signature)) {
    const secretConfigured = !!process.env.CALCOM_WEBHOOK_SECRET?.trim()
    console.error('[webhooks/calcom] firma inválida', {
      secretConfigured,
      hasSignatureHeader: !!signature,
      bodyLength: rawBody.length,
    })
    return res.status(401).json({
      error: secretConfigured
        ? 'Firma de webhook inválida. CALCOM_WEBHOOK_SECRET debe coincidir exactamente con el secret del webhook en Cal.com.'
        : 'Falta header x-cal-signature-256. Configura el mismo secret en Cal.com y en CALCOM_WEBHOOK_SECRET.',
    })
  }

  let body: CalWebhookBody
  try {
    body = JSON.parse(rawBody) as CalWebhookBody
  } catch {
    return res.status(400).json({ error: 'JSON inválido' })
  }

  const trigger = body.triggerEvent?.trim()
  logCal('received', {
    trigger,
    bodyLength: rawBody.length,
    hasPayload: !!body.payload,
    filter: getCalWebhookFilterConfig(),
  })

  // Ping de prueba Cal.com → 200 sin guardar
  if (trigger === 'PING' || trigger === 'TEST_EVENT' || !trigger) {
    logCal('ping_ok', { trigger: trigger || '(empty)' })
    return res.status(200).json({ ok: true, ping: true, trigger: trigger || null })
  }

  if (!isCalWebhookRelevantTrigger(trigger)) {
    logCal('ignored_trigger', { trigger })
    return res.status(200).json({
      ok: true,
      ignored: true,
      reason: 'unsupported_trigger',
      trigger,
    })
  }

  const parsed = parseCalWebhookBooking(body)
  if (!parsed.ok) {
    logCal('ignored_parse', {
      reason: parsed.reason,
      detail: parsed.detail,
    })
    return res.status(200).json({
      ok: true,
      ignored: true,
      reason: parsed.reason,
      detail: parsed.detail,
    })
  }

  const booking = parsed.booking

  try {
    await upsertCalBookingFromWebhook(booking)
    logCal('saved', {
      uid: booking.uid,
      email: booking.attendee_email,
      slug: booking.event_type_slug,
      status: booking.status,
      start: booking.start_time,
    })

    void syncCalBookingToWebPipeline({
      uid: booking.uid,
      attendee_name: booking.attendee_name,
      attendee_email: booking.attendee_email,
      title: booking.title,
      start: booking.start_time,
    })
      .then((cardId) => logCal('pipeline_sync', { uid: booking.uid, cardId }))
      .catch((err) =>
        console.error('[webhooks/calcom] pipeline sync', err instanceof Error ? err.message : err)
      )

    return res.status(200).json({
      ok: true,
      saved: true,
      uid: booking.uid,
      trigger: booking.trigger_event,
      status: booking.status,
      attendee_email: booking.attendee_email,
      event_type_slug: booking.event_type_slug,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('cal_bookings') && msg.includes('does not exist')) {
      console.error('[webhooks/calcom] tabla cal_bookings no existe')
      return res.status(503).json({
        error: 'Tabla cal_bookings no existe. Ejecuta prisma/CREATE_CAL_BOOKINGS.sql',
      })
    }
    console.error('[webhooks/calcom] save error', err)
    return res.status(500).json({ error: msg })
  }
}
