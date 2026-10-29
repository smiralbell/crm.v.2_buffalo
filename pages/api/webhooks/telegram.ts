import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'crypto'
import { isAgentEnabled, webhookSecret } from '@/lib/telegram-agent/config'
import { handleTelegramUpdate } from '@/lib/telegram-agent/handler'
import { startTelegramAgent } from '@/lib/telegram-agent/scheduler'
import type { TgUpdate } from '@/lib/telegram-agent/telegram-api'

function validSecret(req: NextApiRequest): boolean {
  const expected = webhookSecret()
  const got = String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if (!expected || got.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected))
}

/**
 * Webhook del bot de Telegram (agente del CRM).
 * Contesta 200 al momento y procesa después: el agente puede tardar más de lo que
 * Telegram espera y, si no, reenviaría el mensaje.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  if (!isAgentEnabled()) return res.status(200).json({ ok: true, disabled: true })
  if (!validSecret(req)) return res.status(401).json({ error: 'No autorizado' })

  startTelegramAgent()
  const update = req.body as TgUpdate
  res.status(200).json({ ok: true })

  if (!update || typeof update.update_id !== 'number') return
  void handleTelegramUpdate(update).catch((e) => {
    console.error('[telegram-agent] update', update.update_id, e)
  })
}
