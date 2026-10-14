/**
 * Bandeja omnicanal (primer paso): mensajes del chat web enviados por el bot de n8n.
 * Cada mensaje se cuelga del contacto único (email/teléfono). Si el visitante aún no ha dado
 * sus datos, el mensaje queda en la ingesta y se vuelca a su ficha en cuanto se identifica
 * en la misma sesión.
 */
import { createHash } from 'crypto'
import { query } from '@/lib/db'
import { findContactByIdentity } from '@/lib/identity/resolve'
import type { InboundProcessorResult } from '@/lib/ingest/types'

export type WebChatPayload = {
  session_id: string
  role: 'user' | 'assistant'
  text: string
  message_id?: string | null
  email?: string | null
  phone?: string | null
  name?: string | null
  at?: string | null
}

export function parseWebChatPayload(body: unknown): WebChatPayload | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const session = s(b.session_id) ?? s(b.sessionId)
  const text = s(b.text) ?? s(b.message) ?? s(b.content)
  const roleRaw = (s(b.role) ?? 'user').toLowerCase()
  if (!session || !text) return null
  return {
    session_id: session.slice(0, 200),
    role: roleRaw === 'assistant' || roleRaw === 'ai' || roleRaw === 'bot' ? 'assistant' : 'user',
    text: text.slice(0, 8000),
    message_id: s(b.message_id) ?? s(b.id),
    email: s(b.email),
    phone: s(b.phone) ?? s(b.telefono),
    name: s(b.name) ?? s(b.nombre),
    at: s(b.at) ?? s(b.timestamp),
  }
}

export function webChatMessageKey(p: WebChatPayload): string {
  if (p.message_id) return `wc:${p.message_id}`
  return `wc:${createHash('sha256').update(`${p.session_id}|${p.role}|${p.at ?? ''}|${p.text}`).digest('hex').slice(0, 32)}`
}

async function contactForSession(sessionId: string): Promise<number | null> {
  const { rows } = await query<{ contact_id: number }>(
    `SELECT contact_id FROM messages
      WHERE canal = 'web_chat' AND raw_payload->>'session_id' = $1
      ORDER BY id DESC LIMIT 1`,
    [sessionId]
  )
  return rows[0]?.contact_id ?? null
}

async function storeMessage(contactId: number, p: WebChatPayload): Promise<boolean> {
  const key = webChatMessageKey(p)
  const lead = await query<{ id: number }>(`SELECT id FROM leads WHERE contact_id = $1 LIMIT 1`, [contactId])
  const at = p.at && !Number.isNaN(new Date(p.at).getTime()) ? new Date(p.at) : new Date()
  const { rowCount } = await query(
    `INSERT INTO messages (contact_id, lead_id, canal, direccion, contenido, timestamp, raw_payload)
     SELECT $1, $2, 'web_chat', $3, $4, $5, $6::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM messages WHERE canal = 'web_chat' AND raw_payload->>'message_key' = $7)`,
    [
      contactId,
      lead.rows[0]?.id ?? null,
      p.role === 'user' ? 'entrante' : 'saliente',
      p.text,
      at,
      JSON.stringify({ session_id: p.session_id, message_key: key, name: p.name ?? null }),
      key,
    ]
  )
  return rowCount > 0
}

/** Procesador de la ingesta para la fuente «web_chat». */
export async function processWebChat(payload: unknown): Promise<InboundProcessorResult> {
  const p = parseWebChatPayload(payload)
  if (!p) return { status: 'ignored', result: { reason: 'payload_incompleto' } }

  const match = await findContactByIdentity({ email: p.email, phone: p.phone })
  const contactId = match?.contactId ?? (await contactForSession(p.session_id))
  if (!contactId) return { status: 'processed', result: { linked: false, session_id: p.session_id } }

  const stored = await storeMessage(contactId, p)

  // El visitante se acaba de identificar: vuelca los mensajes anteriores de la sesión
  let backfilled = 0
  if (match) {
    const earlier = await query<{ id: string; payload: unknown }>(
      `SELECT id::text, payload FROM inbound_events
        WHERE source = 'web_chat' AND payload->>'session_id' = $1
          AND COALESCE(result->>'linked', 'false') = 'false'`,
      [p.session_id]
    )
    for (const ev of earlier.rows) {
      const prev = parseWebChatPayload(ev.payload)
      if (prev && (await storeMessage(contactId, prev))) backfilled++
      await query(
        `UPDATE inbound_events SET result = jsonb_build_object('linked', true, 'contact_id', $2::int), updated_at = NOW()
          WHERE id = $1`,
        [ev.id, contactId]
      )
    }
  }
  return { status: 'processed', result: { linked: true, contact_id: contactId, stored, backfilled } }
}
