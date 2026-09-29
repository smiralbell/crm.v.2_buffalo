import type { NextApiRequest, NextApiResponse } from 'next'
import { runGmailSyncOnce } from '@/lib/integrations/google/gmail-sync-scheduler'

/**
 * Sync Gmail → historial CRM (crontab / EasyPanel), además del scheduler interno.
 * Auth: Authorization: Bearer <CRON_SECRET>  o  ?secret=<CRON_SECRET>
 */
function authorize(req: NextApiRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret.trim() : ''
  const provided = bearer || querySecret
  return provided.length > 0 && provided === expected
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }
  if (!process.env.CRON_SECRET?.trim()) {
    return res.status(503).json({ error: 'CRON_SECRET no configurado' })
  }
  if (!authorize(req)) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  try {
    return res.status(200).json(await runGmailSyncOnce('cron'))
  } catch (e) {
    console.error('[cron/gmail-sync]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error' })
  }
}
