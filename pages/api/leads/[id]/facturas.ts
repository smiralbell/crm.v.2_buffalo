import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { linkInvoiceToPersona, searchLinkableInvoices, unlinkInvoiceFromPersona } from '@/lib/leads/facturas'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

const postSchema = z.object({ invoice_id: z.number().int().positive() })

/**
 * GET ?buscar=…       → facturas que se pueden vincular.
 * POST {invoice_id}   → vincula la factura al lead (y acceso directo en su carpeta de Drive).
 * DELETE ?invoice_id= → desvincula.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    if (!canSeeClientPrices(ctx.user.role)) return res.status(403).json({ error: 'Sin acceso a facturas' })

    if (req.method === 'GET') {
      return res.json({ facturas: await searchLinkableInvoices(String(req.query.buscar || '')) })
    }
    if (req.method === 'POST') {
      const body = postSchema.parse(req.body ?? {})
      const result = await linkInvoiceToPersona(ctx.leadId, body.invoice_id)
      return res.json({ ok: true, warning: result.warning })
    }
    if (req.method === 'DELETE') {
      const invoiceId = parseInt(String(req.query.invoice_id), 10)
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) return res.status(400).json({ error: 'invoice_id inválido' })
      await unlinkInvoiceFromPersona(ctx.leadId, invoiceId)
      return res.json({ ok: true })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    if (isSessionError(error)) return
    console.error('[leads/facturas]', error)
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Error con las facturas' })
  }
}
