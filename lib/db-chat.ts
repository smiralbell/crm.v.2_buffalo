import { Pool } from 'pg'

let chatPool: Pool | null = null

/**
 * Pool PostgreSQL dedicado al apartado «Chats IA» (historial n8n).
 * Usa DATABASE_URL_chat; el resto de la app sigue usando DATABASE_URL / Prisma.
 */
export function getChatPool(): Pool {
  if (chatPool) {
    return chatPool
  }

  const urlStr = process.env.DATABASE_URL_chat
  if (!urlStr) {
    throw new Error(
      'DATABASE_URL_chat no está configurado. Añádela en .env para el apartado de chats del agente.'
    )
  }

  const url = new URL(urlStr)
  const password = decodeURIComponent(url.password)

  chatPool = new Pool({
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    database: url.pathname.replace(/^\//, ''),
    user: url.username || 'postgres',
    password,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
  })

  chatPool.on('error', (err) => {
    console.error('[db-chat] Unexpected error on idle client', err)
  })

  return chatPool
}

export async function queryChat<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getChatPool()
  const result = await pool.query(text, params)
  return {
    rows: result.rows as T[],
    rowCount: result.rowCount ?? 0,
  }
}

export async function closeChatPool(): Promise<void> {
  if (chatPool) {
    await chatPool.end()
    chatPool = null
  }
}
