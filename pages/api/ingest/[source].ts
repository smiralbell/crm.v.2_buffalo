import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash, timingSafeEqual } from 'crypto'
import { processInboundEvent, recordInboundEvent } from '@/lib/ingest/events'
import { INBOUND_PROCESSORS } from '@/lib/ingest/processors'
import { parseWebChatPayload, webChatMessageKey } from '@/lib/inbox/web-chat'
import { webFormExternalId } from '@/lib/ingest/web-form'

/**
 * Entrada genérica a la ingesta unificada para sistemas propios (n8n…).
 *   POST /api/ingest/web_chat
 *   Authorization: Bearer <INGEST_TOKEN>
 *   { session_id, role: "user"|"assistant", text, message_id?, email?, phone?, name?, at? }
 */
const SOURCES: Record<string, (body: unknown) => { externalId: string; eventType: string } | null> = {
  web_chat: (body) => {
    const p = parseWebChatPayload(body)
    return p ? { externalId: webChatMessageKey(p), eventType: p.role } : null
  },
  web_form: (body) => ({ externalId: webFormExternalId(body), eventType: 'submission' }),
}

function authorized(req: NextApiRequest): boolean {
  const expected = process.env.INGEST_TOKEN?.trim()
  if (!expected) return false
  const header = req.headers.authorization || ''
  const provided = header.replace(/^Bearer\s+/i, '').trim()
  if (!provided) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!process.env.INGEST_TOKEN?.trim()) return res.status(503).json({ error: 'INGEST_TOKEN no configurado' })
  if (!authorized(req)) return res.status(401).json({ error: 'No autorizado' })

  const source = String(req.query.source || '')
  const describe = SOURCES[source]
  if (!describe || !INBOUND_PROCESSORS[source]) return res.status(404).json({ error: `Fuente desconocida: ${source}` })

  const meta = describe(req.body)
  if (!meta) return res.status(400).json({ error: 'Payload no válido para esta fuente' })

  try {
    const recorded = await recordInboundEvent({ source, externalId: meta.externalId, eventType: meta.eventType, payload: req.body })
    if (!recorded) {
      const out = await INBOUND_PROCESSORS[source](req.body)
      return res.status(200).json({ ok: true, ...out })
    }
    if (recorded.duplicate && recorded.status !== 'failed') {
      return res.status(200).json({ ok: true, duplicate: true, event_id: recorded.id })
    }
    const out = await processInboundEvent(recorded.id)
    return res.status(200).json({ ok: true, event_id: recorded.id, status: out?.status ?? recorded.status, result: out?.result })
  } catch (e) {
    console.error('[ingest]', source, e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' })
  }
}
