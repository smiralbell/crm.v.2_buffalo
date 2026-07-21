import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/onboarding/projects/buffalo-status?ids=1,2,3
 * Devuelve flags es_buffalo + setup/mensualidad por lead_id (tabla proyectos).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const raw = String(req.query.ids || '')
    const ids = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)

    if (ids.length === 0) return res.status(200).json({ flags: {}, fees: {} })

    const rows = await prisma.$queryRaw<
      {
        lead_id: number
        es_buffalo: boolean
        setup_fee_eur: number | null
        monthly_fee_eur: number | null
        has_mensualidad: boolean
      }[]
    >`
      SELECT
        lead_id,
        es_buffalo,
        setup_fee_eur::float8 AS setup_fee_eur,
        monthly_fee_eur::float8 AS monthly_fee_eur,
        COALESCE(has_mensualidad, false) AS has_mensualidad
      FROM proyectos
      WHERE lead_id = ANY(${ids}::int[])
    `

    const flags: Record<string, boolean> = {}
    const fees: Record<
      string,
      { setup: number | null; monthly: number | null; has_mensualidad: boolean }
    > = {}

    for (const row of rows) {
      if (row.lead_id == null) continue
      const key = String(row.lead_id)
      flags[key] = Boolean(row.es_buffalo)
      fees[key] = {
        setup: row.setup_fee_eur != null ? Number(row.setup_fee_eur) : null,
        monthly: row.monthly_fee_eur != null ? Number(row.monthly_fee_eur) : null,
        has_mensualidad: Boolean(row.has_mensualidad),
      }
    }

    return res.status(200).json({ flags, fees })
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
