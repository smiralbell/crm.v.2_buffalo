import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { findCrmUserById } from '@/lib/crm-users'
import { getDeveloperDashboardStats } from '@/lib/developer/dashboard'
import { getDeveloperWorkCharts } from '@/lib/developer/work-charts'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (user.role !== 'developer') {
    return res.status(403).json({ error: 'Solo para developers' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    if (user.id > 0) {
      try {
        const dev = await findCrmUserById(user.id)
        if (dev?.name) user = { ...user, name: dev.name }
      } catch {
        // usar nombre de sesión
      }
    }
    const [stats, charts] = await Promise.all([
      getDeveloperDashboardStats(user),
      getDeveloperWorkCharts(user),
    ])
    return res.status(200).json({
      stats,
      charts,
      user: { id: user.id, name: user.name, email: user.email },
    })
  } catch (error) {
    console.error('[developer/dashboard]', error)
    return res.status(500).json({ error: 'Error interno' })
  }
}
