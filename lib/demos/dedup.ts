import { createHash } from 'crypto'
import { query } from '@/lib/db'

export function buildMessageDedupKey(
  messageId: string | null | undefined,
  phone: string,
  text: string
): string {
  if (messageId) return `wa:${messageId}`
  const bucket = Math.floor(Date.now() / 60_000)
  return createHash('sha256').update(`${phone}|${text}|${bucket}`).digest('hex')
}

/**
 * Devuelve true si este mensaje debe procesarse (primera vez).
 * false = duplicado (mismo webhook reenviado o segundo evento Wasender).
 */
export async function claimIncomingDemoMessage(
  messageKey: string,
  demoId?: number,
  phone?: string
): Promise<boolean> {
  try {
    const result = await query<{ message_key: string }>(
      `INSERT INTO demo_processed_messages (message_key, demo_id, phone)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_key) DO NOTHING
       RETURNING message_key`,
      [messageKey, demoId ?? null, phone ?? null]
    )
    return (result.rowCount ?? 0) > 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('demo_processed_messages')) {
      console.warn('[demos/dedup] Tabla demo_processed_messages no existe — sin deduplicación')
      return true
    }
    throw err
  }
}

/** Limpia entradas de dedup antiguas (>7 días) */
export async function pruneOldProcessedMessages(): Promise<void> {
  try {
    await query(
      `DELETE FROM demo_processed_messages WHERE created_at < NOW() - INTERVAL '7 days'`
    )
  } catch {
    // ignorar
  }
}
