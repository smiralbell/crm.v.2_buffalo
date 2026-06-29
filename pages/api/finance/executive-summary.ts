import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { buildExecutiveSummary } from '@/lib/finance/executive-summary'
import { parsePeriodFromQuery } from '@/lib/finance/period-presets'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const period = parsePeriodFromQuery(
      req.query.start as string | undefined,
      req.query.end as string | undefined
    )
    const summary = await buildExecutiveSummary(period)
    return res.status(200).json(summary)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al generar resumen ejecutivo'
    console.error('[finance/executive-summary]', err)
    return res.status(500).json({ error: msg })
  }
}
