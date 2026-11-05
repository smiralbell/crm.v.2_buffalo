import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { ensureRecurringInvoiceColumns } from '@/lib/invoices/recurring'
import { madridToday, parseIsoDate } from '@/lib/invoices/recurring-dates'

const recurringInvoiceSchema = z.object({
  name: z.string().min(1, 'El nombre interno es obligatorio'),
  source_invoice_id: z.number().int().positive().nullable().optional(),
  issue_day: z.number().int().min(1).max(31).optional(),
  due_day: z.number().int().min(1).max(31).nullable().optional(),
  is_active: z.boolean().optional(),
  client_name: z.string().optional(),
  client_company_name: z.string().optional(),
  client_email: z.string().optional(),
  client_address: z.string().optional(),
  client_tax_id: z.string().optional(),
  line_description: z.string().optional(),
  base_amount: z.number().positive('El importe tiene que ser mayor que 0').optional(),
  tax_percent: z.number().min(0).max(100).optional(),
  next_issue_date: z.string().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    if (req.method === 'GET') {
      await ensureRecurringInvoiceColumns()
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
           ri.next_issue_date::text AS next_issue_date,
           i.invoice_number AS source_invoice_number,
           COALESCE(ri.client_name, i.client_name) AS client_name,
           COALESCE(
             i.total,
             ROUND(ri.base_amount * (1 + COALESCE(ri.tax_percent, 21) / 100), 2)
           ) AS total,
           i.status AS source_status
         FROM recurring_invoices ri
         LEFT JOIN invoices i ON i.id = ri.source_invoice_id
         WHERE ri.deleted_at IS NULL
         ORDER BY ri.created_at DESC`
      )

      return res.status(200).json({ recurringInvoices: result.rows })
    }

    if (req.method === 'POST') {
      await ensureRecurringInvoiceColumns()
      const data = recurringInvoiceSchema.parse(req.body)
      const sourceId = data.source_invoice_id ?? null

      if (sourceId) {
        const sourceInvoice = await prisma.invoice.findUnique({
          where: { id: sourceId, deleted_at: null },
        })
        if (!sourceInvoice) {
          return res.status(404).json({ error: 'La factura base no existe' })
        }
        if (!data.issue_day) {
          return res.status(400).json({ error: 'Indica el día de emisión' })
        }
      } else {
        if (!data.client_name?.trim()) {
          return res.status(400).json({ error: 'Escribe el nombre del cliente' })
        }
        if (!data.line_description?.trim()) {
          return res.status(400).json({ error: 'Escribe el concepto, por ejemplo Mantenimiento' })
        }
        if (data.base_amount == null) {
          return res.status(400).json({ error: 'Escribe el importe sin IVA' })
        }
        const first = data.next_issue_date || ''
        if (!parseIsoDate(first)) {
          return res.status(400).json({ error: 'Elige el día en que se creará la primera factura' })
        }
        if (first < madridToday()) {
          return res.status(400).json({ error: 'La primera factura tiene que ser hoy o un día futuro' })
        }
      }

      const firstDate = data.next_issue_date && parseIsoDate(data.next_issue_date) ? data.next_issue_date : null
      const issueDay = sourceId ? data.issue_day! : parseIsoDate(firstDate || '')!.day

      const created = await query(
        `INSERT INTO recurring_invoices (
           name,
           source_invoice_id,
           issue_day,
           due_day,
           is_active,
           client_name,
           client_company_name,
           client_email,
           client_address,
           client_tax_id,
           line_description,
           base_amount,
           tax_percent,
           next_issue_date
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          data.name.trim(),
          sourceId,
          issueDay,
          data.due_day ?? null,
          data.is_active ?? true,
          data.client_name?.trim() || null,
          data.client_company_name?.trim() || null,
          data.client_email?.trim() || null,
          data.client_address?.trim() || null,
          data.client_tax_id?.trim() || null,
          data.line_description?.trim() || null,
          sourceId ? null : data.base_amount,
          sourceId ? null : data.tax_percent ?? 21,
          firstDate,
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
