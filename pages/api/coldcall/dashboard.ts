import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { getColdCallDashboard } from '@/lib/coldcall/dashboard-analytics'
import { resolveColdCallScope } from '@/lib/coldcall/scope'
import { parseColdCallFilterParam } from '@/lib/coldcall/api-query'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const filter = parseColdCallFilterParam(req.query.userId, user.id)
    const scope = await resolveColdCallScope(user, filter)
    const data = await getColdCallDashboard(scope)
    return res.json(data)
  } catch {
    return
  }
}
