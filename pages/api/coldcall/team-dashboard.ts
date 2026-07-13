import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { getColdCallTeamDashboard } from '@/lib/coldcall/team-analytics'

function jsonSafe<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? Number(value) : value))
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const data = await getColdCallTeamDashboard()
    return res.json(jsonSafe(data))
  } catch (err) {
    if (!res.headersSent) {
      console.error('[team-dashboard]', err)
      return res.status(500).json({ error: 'Error al cargar panel de equipo' })
    }
  }
}
