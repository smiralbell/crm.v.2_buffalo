import type { NextApiRequest, NextApiResponse } from 'next'
import { getMetaPageConfig } from '@/lib/integrations/meta/config'
import { verifyMetaSignature, verifyMetaSubscription } from '@/lib/integrations/meta/crypto'
import { ingestMetaLeadgenChange } from '@/lib/integrations/meta/ingest'
import { extractLeadgenEvents } from '@/lib/integrations/meta/parse'

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

function queryString(req: NextApiRequest): Record<string, string | string[] | undefined> {
  return req.query as Record<string, string | string[] | undefined>
}

/**
 * GET  /api/webhooks/meta  — verificación Meta (hub.verify_token → hub.challenge)
 * POST /api/webhooks/meta  — eventos Page leadgen. Firma X-Hub-Signature-256.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const verified = verifyMetaSubscription(queryString(req))
    if (!verified.ok) {
      return res.status(verified.status).send(verified.error)
    }
    res.setHeader('Content-Type', 'text/plain')
    return res.status(200).send(verified.challenge)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const cfg = getMetaPageConfig()
  if (!cfg.appSecret) {
    return res.status(503).json({ error: 'META_APP_SECRET no configurado' })
  }

  let rawBody: string
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    console.error('[webhooks/meta] body read', err)
    return res.status(400).json({ error: 'Invalid body' })
  }

  const signature =
    (req.headers['x-hub-signature-256'] as string | undefined) ||
    (req.headers['X-Hub-Signature-256'] as string | undefined)

  if (!verifyMetaSignature(rawBody, signature, cfg.appSecret)) {
    console.error('[webhooks/meta] firma inválida', {
      hasSignature: !!signature,
      bodyLength: rawBody.length,
    })
    return res.status(401).json({ error: 'Firma inválida' })
  }

  let body: unknown
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return res.status(400).json({ error: 'JSON inválido' })
  }

  const events = extractLeadgenEvents(body)
  if (!events.length) {
    return res.status(200).json({ ok: true, ping: true })
  }

  const results = []
  try {
    for (const change of events) {
      const result = await ingestMetaLeadgenChange(change, change)
      results.push({
        leadgen_id: change.leadgen_id,
        duplicate: result.duplicate,
        status: result.status,
        lead_id: result.leadId ?? null,
      })
    }
  } catch (err) {
    console.error('[webhooks/meta] persist/process', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'No se pudo guardar el evento',
    })
  }

  return res.status(200).json({ ok: true, events: results })
}
