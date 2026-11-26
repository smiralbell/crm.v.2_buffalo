import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { findCrmUserById } from '@/lib/crm-users'
import { getDeveloperDashboardStats } from '@/lib/developer/dashboard'
import { getDeveloperWorkCharts } from '@/lib/developer/work-charts'
import { getHoursReport } from '@/lib/horas/store'

/** Horas reales de la persona: esta semana (desde el lunes) y este mes. */
async function myHours(userId: number): Promise<{ week: number; month: number }> {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const [w, m] = await Promise.all([
    getHoursReport(monday, now, { onlyUserId: userId }),
    getHoursReport(first, now, { onlyUserId: userId }),
  ])
  return { week: w.people[0]?.hours ?? 0, month: m.people[0]?.hours ?? 0 }
}

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
    const [stats, charts, hours] = await Promise.all([
      getDeveloperDashboardStats(user),
      getDeveloperWorkCharts(user),
      myHours(user.id).catch(() => ({ week: 0, month: 0 })),
    ])
    return res.status(200).json({
      stats,
      charts,
      hours,
      user: { id: user.id, name: user.name, email: user.email },
    })
  } catch (error) {
    console.error('[developer/dashboard]', error)
    return res.status(500).json({ error: 'Error interno' })
  }
}
