import type { NextApiRequest, NextApiResponse } from 'next'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { collectLeadContext } from '@/lib/leads/context-sources'
import { autoRelateInvoices } from '@/lib/leads/facturas'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

/** GET: todas las fuentes de contexto del lead (para el mapa de la ficha). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const includePrices = canSeeClientPrices(ctx.user.role)
    if (includePrices) await autoRelateInvoices(ctx.leadId).catch(() => undefined)
    const data = await collectLeadContext(ctx.leadId, { includePrices })
    if (!data) return res.status(404).json({ error: 'Lead no encontrado' })
    return res.json(data)
  } catch (error) {
    if (isSessionError(error)) return
    console.error('[leads/fuentes]', error)
    return res.status(500).json({ error: 'No se pudo cargar el contexto' })
  }
}
