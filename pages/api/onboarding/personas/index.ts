import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { listPersonas } from '@/lib/onboarding/persona-context'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    if (user.role !== 'admin' && user.role !== 'project_manager') {
      return res.status(403).json({ error: 'Sin acceso' })
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const q = typeof req.query.q === 'string' ? req.query.q : undefined
    const personas = await listPersonas({ q })
    return res.json({ personas })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[onboarding/personas]', error)
    return res.status(500).json({ error: 'Error al cargar personas' })
  }
}
