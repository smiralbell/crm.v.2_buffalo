import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { findCrmUserById } from '@/lib/crm-users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let user = await requireAuthAPI(req, res)
    if (user.role === 'developer' && user.id > 0) {
      try {
        const dev = await findCrmUserById(user.id)
        if (dev?.name) user = { ...user, name: dev.name }
      } catch {
        // mantener nombre de sesión
      }
    }
    return res.status(200).json({ user })
  } catch {
    return
  }
}
