import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { generateRecurringInvoice } from '@/lib/invoices/recurring'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const id = req.query.id
    if (typeof id !== 'string' || !id) {
      return res.status(400).json({ error: 'ID inválido' })
    }

    const created = await generateRecurringInvoice(id)
    if (!created.ok) {
      return res.status(created.status).json({ error: created.error })
    }

    return res.status(201).json({
      id: created.id,
      invoice_number: created.invoice_number,
      issue_date: created.issue_date,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }

    console.error('Generate recurring invoice API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
