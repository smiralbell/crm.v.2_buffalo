import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  getFinanceDashboardAnalytics,
  listRecentPeriods,
} from '@/lib/finance/dashboard-analytics'
import { currentFinancePeriod } from '@/lib/finance/dashboard-analytics.types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const period =
    typeof req.query.period === 'string' && /^\d{4}-\d{2}$/.test(req.query.period)
      ? req.query.period
      : currentFinancePeriod()

  try {
    const data = await getFinanceDashboardAnalytics(period)
    return res.status(200).json({
      ...data,
      periods: listRecentPeriods(12),
    })
  } catch (err) {
    console.error('[api/finance/dashboard-analytics]', err)
    return res.status(500).json({ error: 'Error cargando analítica financiera' })
  }
}
