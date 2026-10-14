import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { listMetaAdsCampaigns } from '@/lib/integrations/meta/ads-list'
import { runMetaAdsSyncOnce } from '@/lib/integrations/meta/ads-scheduler'
import { isIsoDate } from '@/lib/integrations/meta/ads-parse'

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    try {
      const data = await listMetaAdsCampaigns({
        period: str(req.query.period),
        since: str(req.query.since),
        until: str(req.query.until),
      })
      return res.status(200).json(data)
    } catch (err) {
      console.error('[api/marketing/meta-campaigns]', err)
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
    }
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
    const action = String(body.action || req.query.action || 'sync')
    const since = typeof body.since === 'string' ? body.since.trim() : str(req.query.since)
    const until = typeof body.until === 'string' ? body.until.trim() : str(req.query.until)

    if (action === 'import') {
      if (!since || !until || !isIsoDate(since) || !isIsoDate(until)) {
        return res.status(400).json({ error: 'Importar histórico requiere since y until (YYYY-MM-DD)' })
      }
    }

    try {
      const ran = await runMetaAdsSyncOnce(action === 'import' ? 'import' : 'manual', { since, until })
      if (!ran.ran && ran.skipped === 'running') {
        return res.status(409).json({ error: 'Ya hay una sincronización en curso' })
      }
      return res.status(200).json({ ok: true, ...ran })
    } catch (err) {
      console.error('[api/marketing/meta-campaigns POST]', err)
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
