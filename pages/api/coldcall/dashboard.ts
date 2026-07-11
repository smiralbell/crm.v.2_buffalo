import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getColdCallDashboard } from '@/lib/coldcall/dashboard-analytics'
import { getColdCallScope } from '@/lib/coldcall/scope'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const data = await getColdCallDashboard(getColdCallScope(user))
    return res.json(data)
  } catch {
    return
  }
}
