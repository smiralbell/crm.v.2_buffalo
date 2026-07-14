import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getWebDashboardMetrics } from '@/lib/marketing/web-dashboard'

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
    const dashboard = await getWebDashboardMetrics(period)
    return res.status(200).json(dashboard)
  } catch (error) {
    console.error('[api/marketing/web-dashboard]', error)
    return res.status(500).json({ error: 'Error al cargar dashboard web' })
  }
}
