import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { currentPeriod, getLeadsAnalytics, listRecentPeriods } from '@/lib/leads/analytics'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const raw = typeof req.query.period === 'string' ? req.query.period : currentPeriod()
  const period = /^\d{4}-\d{2}$/.test(raw) ? raw : currentPeriod()

  try {
    const data = await getLeadsAnalytics(period)
    return res.status(200).json({
      ...data,
      periods: listRecentPeriods(14),
    })
  } catch (err) {
    console.error('[api/leads/analytics]', err)
    return res.status(500).json({ error: 'Error cargando analítica de leads' })
  }
}
