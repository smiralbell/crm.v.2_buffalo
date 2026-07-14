import type { NextApiRequest, NextApiResponse } from 'next'
import {
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
  if (!isCalWebhookRelevantTrigger(trigger)) {
    return res.status(200).json({ ok: true, ignored: true, trigger })
  }

  const parsed = parseCalWebhookBooking(body)
  if (!parsed) {
    return res.status(200).json({ ok: true, ignored: true, reason: 'event_filter_or_missing_uid' })
  }

  try {
    await upsertCalBookingFromWebhook(parsed)
    void syncCalBookingToWebPipeline({
      uid: parsed.uid,
      attendee_name: parsed.attendee_name,
      attendee_email: parsed.attendee_email,
      title: parsed.title,
      start: parsed.start_time,
    }).catch((err) => console.error('[webhooks/calcom] pipeline sync', err))
    console.log(`[Cal.com] ${parsed.trigger_event} | ${parsed.attendee_email || parsed.uid}`)
    return res.status(200).json({
      ok: true,
      uid: parsed.uid,
      trigger: parsed.trigger_event,
      status: parsed.status,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('cal_bookings') && msg.includes('does not exist')) {
      return res.status(503).json({
        error: 'Tabla cal_bookings no existe. Ejecuta prisma/CREATE_CAL_BOOKINGS.sql',
      })
    }
    console.error('[webhooks/calcom]', err)
    return res.status(500).json({ error: msg })
  }
}
