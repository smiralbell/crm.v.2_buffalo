import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** GET /api/onboarding/projects/buffalo-status?ids=1,2,3 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const raw = String(req.query.ids || '')
    const ids = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)

    if (ids.length === 0) return res.status(200).json({ flags: {} })

    const rows = await prisma.$queryRaw<{ lead_id: number; es_buffalo: boolean }[]>`
      SELECT lead_id, es_buffalo
      FROM proyectos
      WHERE lead_id = ANY(${ids}::int[])
    `

    const flags: Record<string, boolean> = {}
    for (const row of rows) {
      if (row.lead_id != null) flags[String(row.lead_id)] = Boolean(row.es_buffalo)
    }
    return res.status(200).json({ flags })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[buffalo-status]', error)
    return res.status(500).json({ error: 'Error' })
  }
}
