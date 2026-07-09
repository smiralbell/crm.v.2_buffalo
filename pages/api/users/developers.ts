import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { listDeveloperUsers } from '@/lib/crm-users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const users = await listDeveloperUsers()
    return res.status(200).json({ users })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    return res.status(500).json({ error: 'Error interno' })
  }
}
