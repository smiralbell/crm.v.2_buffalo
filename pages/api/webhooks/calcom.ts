import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getCalWebhookFilterConfig,
  verifyCalWebhookSignature,
  type CalWebhookBody,
} from '@/lib/marketing/cal-bookings-webhook'
import { hashBody, processInboundEvent, recordInboundEvent } from '@/lib/ingest/events'
import { INBOUND_PROCESSORS, type InboundProcessorResult } from '@/lib/ingest/processors'

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

  try {
    // Ingesta unificada: se guarda el evento crudo antes de procesarlo (reintentable)
    const recorded = await recordInboundEvent({
      source: 'calcom',
      externalId: hashBody(rawBody),
      eventType: trigger,
      payload: body,
    })
    if (recorded?.duplicate && (recorded.status === 'processed' || recorded.status === 'ignored')) {
      logCal('duplicate', { event_id: recorded.id })
      return res.status(200).json({ ok: true, duplicate: true, event_id: recorded.id })
    }

    if (!recorded) {
      // Migraciones sin aplicar: procesa directo, como antes
      const out = await INBOUND_PROCESSORS.calcom(body)
      return res.status(200).json(calResponse(out))
    }

    const out = await processInboundEvent(recorded.id)
    if (!out) return res.status(200).json({ ok: true, accepted: true, event_id: recorded.id })
    if (out.status === 'failed') {
      // Guardado: el worker lo reintenta. Cal.com no necesita volver a enviarlo.
      logCal('queued_retry', { event_id: recorded.id, error: out.error })
      return res.status(200).json({ ok: true, saved: false, queued_retry: true, event_id: recorded.id })
    }
    logCal(out.status === 'processed' ? 'saved' : 'ignored', { event_id: recorded.id, ...(out.result || {}) })
    const status = out.status === 'ignored' ? 'ignored' : 'processed'
    return res.status(200).json({ ...calResponse({ status, result: out.result }), event_id: recorded.id })
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

function calResponse(out: InboundProcessorResult) {
  if (out.status === 'ignored') return { ok: true, ignored: true, ...(out.result || {}) }
  return { ok: true, saved: true, ...(out.result || {}) }
}
