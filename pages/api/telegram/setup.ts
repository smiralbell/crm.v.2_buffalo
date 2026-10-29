import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { allowedUserIds, isAgentEnabled } from '@/lib/telegram-agent/config'
import { ensureWebhook } from '@/lib/telegram-agent/scheduler'
import { ensureTelegramAgentTables } from '@/lib/telegram-agent/store'
import { getMe, getWebhookInfo } from '@/lib/telegram-agent/telegram-api'

/**
 * Estado y conexión del agente de Telegram (solo admin, logueado en el CRM).
 *   GET  /api/telegram/setup   → estado (bot, webhook, socios autorizados)
 *   POST /api/telegram/setup   → apunta el bot a este CRM y crea las tablas
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
  } catch {
    return
  }
  if (!isAgentEnabled()) {
    return res.status(400).json({ error: 'Agente desactivado: hace falta TELEGRAM_BOT_TOKEN y TELEGRAM_AGENT=1' })
  }
  try {
    if (req.method === 'POST') {
      await ensureTelegramAgentTables()
      const result = await ensureWebhook(true)
      return res.status(200).json({ ok: true, ...result })
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })
    const [me, info] = await Promise.all([getMe(), getWebhookInfo()])
    return res.status(200).json({
      ok: true,
      bot: me.username,
      webhook: info,
      socios_autorizados: Array.from(allowedUserIds()).length,
    })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error' })
  }
}
