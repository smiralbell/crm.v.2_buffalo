import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { listMetaAdsLeads } from '@/lib/integrations/meta/list'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const period = (req.query.period as string) || currentPeriod

  try {
    const data = await listMetaAdsLeads(period)
    return res.status(200).json({
      leads: data.rows,
      summary: data.summary,
      period: data.period,
    })
  } catch (err) {
    console.error('[api/marketing/meta-leads]', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
  }
}
