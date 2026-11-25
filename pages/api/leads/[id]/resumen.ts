import type { NextApiRequest, NextApiResponse } from 'next'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { getLeadSummary, regenerateLeadSummary } from '@/lib/leads/lead-summary'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

/**
 * GET  → resumen guardado y si hay contenido nuevo que lo deja desfasado.
 * POST → genera el resumen de nuevo con la IA.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    const includePrices = canSeeClientPrices(ctx.user.role)
    if (req.method === 'GET') {
      const out = await getLeadSummary(ctx.leadId, includePrices)
      if (!out) return res.status(404).json({ error: 'Lead no encontrado' })
      return res.json(out)
    }
    if (req.method === 'POST') {
      const out = await regenerateLeadSummary(ctx.leadId, includePrices)
      if (!out) return res.status(404).json({ error: 'Lead no encontrado' })
      return res.json(out)
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (isSessionError(error)) return
    console.error('[leads/resumen]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo generar el resumen' })
  }
}
