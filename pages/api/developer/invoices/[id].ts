import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getDeveloperInvoice } from '@/lib/developer/invoices'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (user.role !== 'developer') {
    return res.status(403).json({ error: 'Solo para developers' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

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
    console.error('[developer/invoices/[id]]', error)
    return res.status(500).json({ error: 'Error interno' })
  }
}
