import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { getPool } from '@/lib/db'
import { ensureTelegramAgentTables } from '@/lib/telegram-agent/store'
import { getUserWhatsAppPhone } from '@/lib/team-agent/identity'
import { waChatId } from '@/lib/whatsapp-agent/config'

const MAX_MESSAGES = 200

/**
 * Solo admin: últimas conversaciones de WhatsApp de un developer / PM con el agente del equipo.
 * Los mensajes se guardan por chat = móvil del usuario (ver lib/whatsapp-agent/handler.ts).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
    const userId = parseInt(String(req.query.id), 10)
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'id inválido' })
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const phone = await getUserWhatsAppPhone(userId)
    if (!phone) return res.status(200).json({ phone: null, mensajes: [] })

    await ensureTelegramAgentTables()
    const chatId = waChatId(phone)
    const { rows } = await getPool().query<{ id: number; role: string; content: string; created_at: Date }>(
      `SELECT id, role, content, created_at
         FROM telegram_agent_messages
        WHERE chat_id = $1 AND role <> 'reset' AND content <> ''
        ORDER BY id DESC
        LIMIT $2`,
      [chatId, MAX_MESSAGES]
    )
    const mensajes = rows
      .reverse()
      .map((r) => ({
        id: r.id,
        role: r.role === 'assistant' ? 'assistant' : 'user',
        content: r.content,
        created_at: new Date(r.created_at).toISOString(),
      }))
    return res.status(200).json({ phone, mensajes })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[users/whatsapp-conversaciones]', error)
    return res.status(500).json({ error: 'No se pudieron cargar las conversaciones' })
  }
}
