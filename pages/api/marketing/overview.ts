import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { currentPeriod } from '@/lib/leads/analytics'
import { getMarketingOverview } from '@/lib/marketing/overview'

/** Panel general de marketing (solo lectura). Incluye € cobrados: mismo permiso que Analítica de leads. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    if (!canSeeClientPrices(user.role)) return res.status(403).json({ error: 'Acceso denegado' })
  } catch {
    return
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const raw = typeof req.query.period === 'string' ? req.query.period : currentPeriod()
  const period = /^\d{4}-\d{2}$/.test(raw) ? raw : currentPeriod()
  try {
    return res.status(200).json(await getMarketingOverview(period))
  } catch (err) {
    console.error('[api/marketing/overview]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
