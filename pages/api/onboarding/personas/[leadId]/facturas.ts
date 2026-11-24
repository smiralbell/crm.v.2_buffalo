import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireLeadAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import {
  linkInvoiceToPersona,
  searchLinkableInvoices,
  unlinkInvoiceFromPersona,
} from '@/lib/onboarding/persona-facturas'

const postSchema = z.object({ invoice_id: z.number().int().positive() })

/**
 * GET ?buscar=…       → facturas que se pueden vincular.
 * POST {invoice_id}   → vincula (la persona debe tener contacto).
 * DELETE ?invoice_id= → desvincula.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireLeadAccessAPI(req, res, req.query.leadId)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) return res.status(400).json({ error: 'leadId inválido' })

    if (req.method === 'GET') {
      const facturas = await searchLinkableInvoices(String(req.query.buscar || ''))
      return res.json({ facturas })
    }

    if (req.method === 'POST') {
      const body = postSchema.parse(req.body ?? {})
      const result = await linkInvoiceToPersona(leadId, body.invoice_id)
      return res.json({ ok: true, warning: result.warning })
    }

    if (req.method === 'DELETE') {
      const invoiceId = parseInt(String(req.query.invoice_id), 10)
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) return res.status(400).json({ error: 'invoice_id inválido' })
      await unlinkInvoiceFromPersona(leadId, invoiceId)
      return res.json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[onboarding/personas/facturas]', error)
    const msg = error instanceof Error ? error.message : 'Error con las facturas'
    return res.status(400).json({ error: msg })
  }
}
