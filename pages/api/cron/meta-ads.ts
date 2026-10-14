import type { NextApiRequest, NextApiResponse } from 'next'
import { isIsoDate } from '@/lib/integrations/meta/ads-parse'
import { runMetaAdsSyncOnce } from '@/lib/integrations/meta/ads-scheduler'

/**
 * Sync campañas Meta Ads (EasyPanel / crontab), además del scheduler interno cada hora.
 * Auth: Authorization: Bearer <CRON_SECRET>  o  ?secret=<CRON_SECRET>
 * Query: since=YYYY-MM-DD&until=YYYY-MM-DD  → histórico de ese rango
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
  if (!authorize(req)) return res.status(401).json({ error: 'No autorizado' })

  const since = typeof req.query.since === 'string' && isIsoDate(req.query.since) ? req.query.since : undefined
  const until = typeof req.query.until === 'string' && isIsoDate(req.query.until) ? req.query.until : undefined

  try {
    const result = await runMetaAdsSyncOnce(since && until ? 'cron-import' : 'cron', { since, until })
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron/meta-ads]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error' })
  }
}
