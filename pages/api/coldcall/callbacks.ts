import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { listColdCallCallbacks } from '@/lib/coldcall/callbacks'
import { resolveColdCallScope, type ColdCallFilter } from '@/lib/coldcall/scope'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  try {
    const user = await requireColdCallAPI(req, res)
    const filter = req.query.filter as ColdCallFilter | undefined
    const scope = await resolveColdCallScope(
      user,
      filter === 'team' ? 'team' : filter ? parseInt(String(filter), 10) : undefined
    )
    const callbacks = await listColdCallCallbacks(scope)
    return res.json({ callbacks })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/callbacks]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
