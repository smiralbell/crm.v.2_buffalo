import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'

const recurringInvoiceSchema = z.object({
  name: z.string().min(1, 'El nombre interno es obligatorio'),
  source_invoice_id: z.number().int().positive('Debes seleccionar una factura base'),
  issue_day: z.number().int().min(1).max(31),
  due_day: z.number().int().min(1).max(31).nullable().optional(),
  is_active: z.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    if (req.method === 'GET') {
      const result = await query(
        `SELECT
           ri.id,
           ri.name,
           ri.source_invoice_id,
           ri.issue_day,
           ri.due_day,
           ri.is_active,
           ri.last_generated_at,
           ri.last_generated_period,
           ri.last_generated_invoice_id,
           ri.created_at,
           i.invoice_number AS source_invoice_number,
           i.client_name,
           i.total,
           i.status AS source_status
         FROM recurring_invoices ri
         INNER JOIN invoices i ON i.id = ri.source_invoice_id
         WHERE ri.deleted_at IS NULL
         ORDER BY ri.created_at DESC`
      )

      return res.status(200).json({ recurringInvoices: result.rows })
    }

    if (req.method === 'POST') {
      const data = recurringInvoiceSchema.parse(req.body)

      const sourceInvoice = await prisma.invoice.findUnique({
        where: { id: data.source_invoice_id, deleted_at: null },
      })

      if (!sourceInvoice) {
        return res.status(404).json({ error: 'La factura base no existe' })
      }

      const created = await query(
        `INSERT INTO recurring_invoices (
           name,
           source_invoice_id,
           issue_day,
           due_day,
           is_active
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          data.name.trim(),
          data.source_invoice_id,
          data.issue_day,
          data.due_day ?? null,
          data.is_active ?? true,
        ]
      )

      return res.status(201).json(created.rows[0])
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }

    console.error('Recurring invoices API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
