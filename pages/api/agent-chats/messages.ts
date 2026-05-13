import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { queryChat } from '@/lib/db-chat'
import {
  AGENT_CHAT_HISTORY_TABLE,
  parseAgentChatMessage,
  shouldHideAgentChatMessage,
} from '@/lib/agent-chat-history'
import { AGENT_CHAT_MAX_MESSAGES_PER_REQUEST } from '@/lib/agent-chat-db'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const TABLE = AGENT_CHAT_HISTORY_TABLE
const MAX_SESSION_LEN = 512

/** Leemos más filas de las que devolvemos porque en medio hay mensajes de tool que filtramos. */
const MAX_ROWS_SCAN = 2500

const RATE_MAX = 72
const RATE_WINDOW_MS = 60_000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const ip = getClientIP(req)
  const rl = checkRateLimit(`agent-chats:messages:${ip}`, RATE_MAX, RATE_WINDOW_MS)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetTime - Date.now()) / 1000)))
    return res.status(429).json({ error: 'Demasiadas consultas. Espera un momento e inténtalo de nuevo.' })
  }

  const sessionId =
    typeof req.query.sessionId === 'string'
      ? req.query.sessionId
      : Array.isArray(req.query.sessionId)
        ? req.query.sessionId[0]
        : ''

  if (!sessionId || sessionId.length > MAX_SESSION_LEN) {
    return res.status(400).json({ error: 'sessionId inválido' })
  }

  const cap = AGENT_CHAT_MAX_MESSAGES_PER_REQUEST

  try {
    const { rows } = await queryChat<{ id: number; message: unknown }>(
      `SELECT id, message
       FROM ${TABLE}
       WHERE session_id = $1
       ORDER BY id ASC
       LIMIT $2`,
      [sessionId, MAX_ROWS_SCAN]
    )

    const chatRows = rows.filter((row) => {
      const parsed = parseAgentChatMessage(row.message)
      return !shouldHideAgentChatMessage(parsed)
    })

    const truncated = chatRows.length > cap
    const slice = truncated ? chatRows.slice(0, cap) : chatRows

    const messages = slice.map((row) => {
      const parsed = parseAgentChatMessage(row.message)
      return {
        id: row.id,
        role: parsed.role,
        text: parsed.text,
      }
    })

    res.setHeader('Cache-Control', 'private, max-age=30')

    return res.status(200).json({ sessionId, messages, truncated })
  } catch (e) {
    console.error('[agent-chats/messages]', e)
    const msg = e instanceof Error ? e.message : 'Error al cargar mensajes'
    return res.status(500).json({ error: msg })
  }
}
