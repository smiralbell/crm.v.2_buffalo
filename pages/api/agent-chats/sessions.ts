import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { queryChat } from '@/lib/db-chat'
import {
  AGENT_CHAT_HISTORY_TABLE,
  parseAgentChatMessage,
  previewText,
  shouldHideAgentChatMessage,
} from '@/lib/agent-chat-history'
import {
  AGENT_CHAT_DEFAULT_PAGE_SIZE,
  AGENT_CHAT_MAX_PAGE_SIZE,
} from '@/lib/agent-chat-db'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const TABLE = AGENT_CHAT_HISTORY_TABLE

/** Listados: pocas peticiones por minuto e IP (CRM interno). */
const RATE_MAX = 36
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
  const rl = checkRateLimit(`agent-chats:sessions:${ip}`, RATE_MAX, RATE_WINDOW_MS)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetTime - Date.now()) / 1000)))
    return res.status(429).json({ error: 'Demasiadas consultas. Espera un momento e inténtalo de nuevo.' })
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const pageSize = Math.min(
    AGENT_CHAT_MAX_PAGE_SIZE,
    Math.max(5, parseInt(req.query.pageSize as string, 10) || AGENT_CHAT_DEFAULT_PAGE_SIZE)
  )
  const offset = (page - 1) * pageSize

  const searchClause = search ? `WHERE session_id ILIKE '%' || $1::text || '%'` : ''

  try {
    // Una sola consulta pesada: total vía ventana + página + join al último mensaje
    const listParams: (string | number)[] = search ? [search, pageSize, offset] : [pageSize, offset]
    const limitParam = search ? 2 : 1
    const offsetParam = search ? 3 : 2
    const listSql = `
      WITH grouped AS (
        SELECT session_id,
               SUM(
                 CASE
                   WHEN COALESCE(message->>'type', '') = 'tool' THEN 0
                   WHEN COALESCE(message #>> '{id,-1}', '') = 'ToolMessage' THEN 0
                   ELSE 1
                 END
               )::int AS message_count,
               MAX(id) AS last_row_id
        FROM ${TABLE}
        ${searchClause}
        GROUP BY session_id
      ),
      ranked AS (
        SELECT session_id,
               message_count,
               last_row_id,
               COUNT(*) OVER ()::int AS total_sessions
        FROM grouped
        ORDER BY last_row_id DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      )
      SELECT r.session_id,
             r.message_count,
             r.last_row_id,
             r.total_sessions,
             lm.message AS last_message
      FROM ranked r
      LEFT JOIN LATERAL (
        SELECT t.message
        FROM ${TABLE} t
        WHERE t.session_id = r.session_id
          AND COALESCE(t.message->>'type', '') != 'tool'
          AND COALESCE(t.message #>> '{id,-1}', '') != 'ToolMessage'
        ORDER BY t.id DESC
        LIMIT 1
      ) lm ON true
      ORDER BY r.last_row_id DESC
    `

    let { rows } = await queryChat<{
      session_id: string
      message_count: number
      last_row_id: number
      total_sessions: number
      last_message: unknown
    }>(listSql, listParams)

    let total = rows[0]?.total_sessions ?? 0

    if (rows.length === 0 && page > 1) {
      const countSql = `
        SELECT COUNT(*)::int AS total
        FROM (SELECT session_id FROM ${TABLE} ${searchClause} GROUP BY session_id) t
      `
      const countParams = search ? [search] : []
      const { rows: countRows } = await queryChat<{ total: number }>(countSql, countParams)
      total = countRows[0]?.total ?? 0
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    const sessions = rows.map((r) => {
      const parsed = parseAgentChatMessage(r.last_message)
      const hidePreview = shouldHideAgentChatMessage(parsed)
      return {
        sessionId: r.session_id,
        messageCount: r.message_count,
        lastPreview: hidePreview ? '' : previewText(parsed.text),
        lastRole: parsed.role,
      }
    })

    res.setHeader('Cache-Control', 'private, max-age=15')

    return res.status(200).json({
      sessions,
      pagination: { page, pageSize, total, totalPages },
    })
  } catch (e) {
    console.error('[agent-chats/sessions]', e)
    const msg = e instanceof Error ? e.message : 'Error al cargar sesiones'
    return res.status(500).json({ error: msg })
  }
}
