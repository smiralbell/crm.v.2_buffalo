import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { lookupProspectsByPhone } from '@/lib/coldcall/phone-lookup'
import { resolveColdCallScope, type ColdCallFilter } from '@/lib/coldcall/scope'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })

  try {
    const user = await requireColdCallAPI(req, res)
    const q = typeof req.query.q === 'string' ? req.query.q : ''
    if (!q.trim()) {
      return res.status(400).json({ error: 'Indica un número (q)' })
    }

    const filter = req.query.filter as ColdCallFilter | undefined
    const scope = await resolveColdCallScope(
      user,
      filter === 'team' ? 'team' : filter ? parseInt(String(filter), 10) : undefined
    )

    const results = await lookupProspectsByPhone(scope, q)
    return res.status(200).json({ results, query: q.trim() })
  } catch (error) {
    if (
      error instanceof Error &&
      ['Forbidden', 'No session', 'Invalid session'].includes(error.message)
    ) {
      return
    }
    console.error('[coldcall/phone-lookup]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
