import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getDeveloperDashboardStats } from '@/lib/developer/dashboard'

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
    const stats = await getDeveloperDashboardStats(user)
    return res.status(200).json({ stats })
  } catch (error) {
    console.error('[developer/dashboard]', error)
    return res.status(500).json({ error: 'Error interno' })
  }
}
