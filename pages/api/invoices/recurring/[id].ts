import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureRecurringInvoiceColumns } from '@/lib/invoices/recurring'
import { parseIsoDate } from '@/lib/invoices/recurring-dates'

const updateSchema = z.object({
  is_active: z.boolean().optional(),
  name: z.string().min(1).optional(),
  issue_day: z.number().int().min(1).max(31).optional(),
  due_day: z.number().int().min(1).max(31).nullable().optional(),
  client_name: z.string().optional(),
  client_company_name: z.string().optional(),
  client_email: z.string().optional(),
  client_address: z.string().optional(),
  client_tax_id: z.string().optional(),
  line_description: z.string().optional(),
  base_amount: z.number().positive('El importe tiene que ser mayor que 0').nullable().optional(),
  tax_percent: z.number().min(0).max(100).nullable().optional(),
  next_issue_date: z.string().nullable().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    const id = req.query.id
    if (typeof id !== 'string' || !id) {
      return res.status(400).json({ error: 'ID inválido' })
    }

    if (req.method === 'PATCH') {
      await ensureRecurringInvoiceColumns()
      const data = updateSchema.parse(req.body)
      const sets: string[] = []
      const values: unknown[] = []
      const set = (column: string, value: unknown) => {
        values.push(value)
        sets.push(`${column} = $${values.length}`)
      }

      if (data.is_active !== undefined) set('is_active', data.is_active)
      if (data.name !== undefined) set('name', data.name.trim())
      if (data.issue_day !== undefined) set('issue_day', data.issue_day)
      if (data.due_day !== undefined) set('due_day', data.due_day)
      if (data.client_name !== undefined) set('client_name', data.client_name.trim() || null)
      if (data.client_company_name !== undefined) set('client_company_name', data.client_company_name.trim() || null)
      if (data.client_email !== undefined) set('client_email', data.client_email.trim() || null)
      if (data.client_address !== undefined) set('client_address', data.client_address.trim() || null)
      if (data.client_tax_id !== undefined) set('client_tax_id', data.client_tax_id.trim() || null)
      if (data.line_description !== undefined) set('line_description', data.line_description.trim() || null)
      if (data.base_amount !== undefined) set('base_amount', data.base_amount)
      if (data.tax_percent !== undefined) set('tax_percent', data.tax_percent)
      if (data.next_issue_date !== undefined) {
        if (data.next_issue_date == null || data.next_issue_date === '') {
          set('next_issue_date', null)
        } else {
          const parsed = parseIsoDate(data.next_issue_date)
          if (!parsed) {
            return res.status(400).json({ error: 'Elige un día válido para la próxima factura' })
          }
          set('next_issue_date', data.next_issue_date)
          set('issue_day', parsed.day)
        }
      }

      if (sets.length === 0) {
        return res.status(400).json({ error: 'No hay cambios para guardar' })
      }

      values.push(id)
      const result = await query(
        `UPDATE recurring_invoices
            SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length}
            AND deleted_at IS NULL
        RETURNING *`,
        values
      )

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Factura recurrente no encontrada' })
      }

      return res.status(200).json(result.rows[0])
    }

    if (req.method === 'DELETE') {
      const result = await query(
        `UPDATE recurring_invoices
            SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
        RETURNING id`,
        [id]
      )

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Factura recurrente no encontrada' })
      }

      return res.status(200).json({ success: true })
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

    console.error('Recurring invoice update API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
