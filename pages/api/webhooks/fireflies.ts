import type { NextApiRequest, NextApiResponse } from 'next'
import {
  isFirefliesPrematureEvent,
  isFirefliesTranscriptReadyEvent,
  parseFirefliesWebhookPayload,
  verifyFirefliesWebhookSignature,
} from '@/lib/integrations/fireflies/client'
import { syncFirefliesMeetingById } from '@/lib/integrations/fireflies/sync'

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

function logFf(step: string, data?: Record<string, unknown>) {
  console.log(`[webhooks/fireflies] ${step}`, data ? JSON.stringify(data) : '')
}

/**
 * Fireflies exige 2xx en < 10s. Respondemos ya y procesamos en background
 * (GraphQL + match + nota pueden tardar más).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'fireflies-webhook',
      hint: 'POST meeting.transcribed / meeting.summarized aquí. Configura esta URL en Fireflies → Integrations → Webhooks V2.',
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let rawBody: string
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    console.error('[webhooks/fireflies] body read error', err)
    return res.status(400).json({ error: 'Invalid body' })
  }

  const signature =
    (req.headers['x-hub-signature'] as string | undefined) ||
    (req.headers['X-Hub-Signature'] as string | undefined)

  if (!verifyFirefliesWebhookSignature(rawBody, signature)) {
    const secretConfigured = !!process.env.FIREFLIES_WEBHOOK_SECRET?.trim()
    console.error('[webhooks/fireflies] firma inválida', {
      secretConfigured,
      hasSignatureHeader: !!signature,
      bodyLength: rawBody.length,
    })
    return res.status(401).json({ error: 'Firma de webhook inválida' })
  }

  let parsedJson: unknown
  try {
    parsedJson = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return res.status(400).json({ error: 'JSON inválido' })
  }

  const { event, meetingId } = parseFirefliesWebhookPayload(parsedJson)
  logFf('received', {
    event: event || null,
    meetingId,
    bodyLength: rawBody.length,
    keys:
      parsedJson && typeof parsedJson === 'object'
        ? Object.keys(parsedJson as object)
        : [],
  })

  if (!meetingId) {
    logFf('ping_ok', { event: event || '(empty)' })
    return res.status(200).json({ ok: true, ping: true, event: event || null })
  }

  if (isFirefliesPrematureEvent(event)) {
    logFf('ignored_event', { event, reason: 'transcript_not_ready' })
    return res.status(200).json({ ok: true, ignored: true, event })
  }

  if (event && !isFirefliesTranscriptReadyEvent(event)) {
    logFf('ignored_event', { event })
    return res.status(200).json({ ok: true, ignored: true, event })
  }

  // ACK inmediato — Fireflies corta a los 10s
  res.status(200).json({
    ok: true,
    accepted: true,
    event: event || null,
    meeting_id: meetingId,
  })

  void syncFirefliesMeetingById(meetingId)
    .then((row) => {
      logFf('synced', {
        fireflies_id: row.fireflies_id,
        lead_id: row.lead_id,
        contact_id: row.contact_id,
        status: row.status,
        match_reason: row.match_reason,
        has_transcript: Boolean(row.transcript),
        has_summary: Boolean(row.summary_overview),
      })
    })
    .catch((err) => {
      console.error('[webhooks/fireflies] sync error', err)
    })
}
