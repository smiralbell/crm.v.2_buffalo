import type { NextApiRequest, NextApiResponse } from 'next'
import { requireFreelancerInvoicesAPI } from '@/lib/auth'
import { deleteDeveloperInvoice, DeveloperInvoicesConfigError, getDeveloperInvoice } from '@/lib/developer/invoices'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireFreelancerInvoicesAPI(req, res)
  } catch {
    return
  }

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method === 'GET') {
    try {
      const invoice = await getDeveloperInvoice(user.id, id)
      if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' })
      return res.status(200).json({
        invoice: {
          ...invoice,
          issue_date: invoice.issue_date.toISOString(),
          created_at: invoice.created_at.toISOString(),
        },
      })
    } catch (error) {
      if (error instanceof DeveloperInvoicesConfigError) {
        return res.status(503).json({ error: 'Migración pendiente', hint: error.message })
      }
      console.error('[developer/invoices/[id] GET]', error)
      return res.status(500).json({ error: 'Error interno' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const ok = await deleteDeveloperInvoice(user.id, id)
      if (!ok) return res.status(404).json({ error: 'Factura no encontrada' })
      return res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof DeveloperInvoicesConfigError) {
        return res.status(503).json({ error: 'Migración pendiente', hint: error.message })
      }
      console.error('[developer/invoices/[id] DELETE]', error)
      return res.status(500).json({ error: 'Error al eliminar' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
