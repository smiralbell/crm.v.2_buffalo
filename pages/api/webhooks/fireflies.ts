import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyFirefliesWebhookSignature } from '@/lib/integrations/fireflies/client'
import { syncFirefliesMeetingById } from '@/lib/integrations/fireflies/sync'
import { toMeetingDto } from '@/lib/integrations/fireflies/store'

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

type FirefliesWebhookBody = {
  event?: string
  meeting_id?: string
  meetingId?: string
}

function logFf(step: string, data?: Record<string, unknown>) {
  console.log(`[webhooks/fireflies] ${step}`, data ? JSON.stringify(data) : '')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  let body: FirefliesWebhookBody
  try {
    body = JSON.parse(rawBody) as FirefliesWebhookBody
  } catch {
    return res.status(400).json({ error: 'JSON inválido' })
  }

  const event = (body.event || '').trim()
  const meetingId = (body.meeting_id || body.meetingId || '').trim()

  logFf('received', { event, meetingId: meetingId || null, bodyLength: rawBody.length })

  // Ping / test sin meeting_id
  if (!meetingId) {
    logFf('ping_ok', { event: event || '(empty)' })
    return res.status(200).json({ ok: true, ping: true, event: event || null })
  }

  if (
    event &&
    event !== 'meeting.transcribed' &&
    event !== 'meeting.summarized' &&
    !event.toLowerCase().includes('transcript')
  ) {
    logFf('ignored_event', { event })
    return res.status(200).json({ ok: true, ignored: true, event })
  }

  try {
    const row = await syncFirefliesMeetingById(meetingId)
    logFf('synced', {
      fireflies_id: row.fireflies_id,
      lead_id: row.lead_id,
      status: row.status,
      has_transcript: Boolean(row.transcript),
      has_summary: Boolean(row.summary_overview),
    })
    return res.status(200).json({ ok: true, meeting: toMeetingDto(row, false) })
  } catch (err) {
    console.error('[webhooks/fireflies] sync error', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Error sincronizando Fireflies',
    })
  }
}
