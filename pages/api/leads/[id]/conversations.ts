import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import { phoneTail } from '@/lib/identity/normalize'

/**
 * GET /api/leads/[id]/conversations
 * Conversaciones del contacto en todos los canales: chat web (bot de n8n) y WhatsApp (demos).
 */
type Msg = { channel: string; thread: string; role: 'contacto' | 'buffalo'; text: string; at: string | null }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })
  const leadId = parseInt(String(req.query.id), 10)
  if (Number.isNaN(leadId)) return res.status(400).json({ error: 'ID inválido' })

  try {
    const contact = await query<{ contact_id: number; telefono: string | null }>(
      `SELECT l.contact_id, c.telefono FROM leads l JOIN contacts c ON c.id = l.contact_id WHERE l.id = $1`,
      [leadId]
    )
    const row = contact.rows[0]
    if (!row) return res.status(404).json({ error: 'Lead no encontrado' })

    const out: Msg[] = []

    const stored = await query<{ canal: string; direccion: string; contenido: string; timestamp: Date; session: string | null }>(
      `SELECT canal, direccion, contenido, timestamp, raw_payload->>'session_id' AS session
         FROM messages WHERE contact_id = $1 ORDER BY timestamp ASC LIMIT 500`,
      [row.contact_id]
    )
    for (const m of stored.rows) {
      out.push({
        channel: m.canal,
        thread: m.session || m.canal,
        role: m.direccion === 'entrante' ? 'contacto' : 'buffalo',
        text: m.contenido,
        at: m.timestamp ? new Date(m.timestamp).toISOString() : null,
      })
    }

    const tail = phoneTail(row.telefono)
    if (tail) {
      try {
        const wa = await query<{ demo: string; messages: unknown }>(
          `SELECT d.nombre_cliente AS demo, dc.messages
             FROM demo_conversaciones dc JOIN demos d ON d.id = dc.demo_id
            WHERE RIGHT(regexp_replace(dc.numero_telefono, '[^0-9]', '', 'g'), 9) = $1
            ORDER BY dc.updated_at DESC LIMIT 5`,
          [tail]
        )
        for (const conv of wa.rows) {
          const list = Array.isArray(conv.messages) ? (conv.messages as Array<{ role: string; content: string; at?: string }>) : []
          for (const m of list) {
            out.push({
              channel: 'whatsapp',
              thread: `WhatsApp · ${conv.demo}`,
              role: m.role === 'user' ? 'contacto' : 'buffalo',
              text: String(m.content ?? ''),
              at: m.at ?? null,
            })
          }
        }
      } catch {
        // módulo de demos sin tablas en este entorno
      }
    }

    return res.status(200).json({ messages: out })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' })
  }
}
