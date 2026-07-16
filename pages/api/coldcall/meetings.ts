import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { listColdCallMeetings } from '@/lib/coldcall/meetings'
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
    const daysAhead = Math.min(120, Math.max(1, parseInt(String(req.query.daysAhead || '60'), 10) || 60))
    const daysBack = Math.min(90, Math.max(0, parseInt(String(req.query.daysBack || '14'), 10) || 14))
    const meetings = await listColdCallMeetings(scope, { daysAhead, daysBack })
    return res.json({ meetings })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[coldcall/meetings]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
