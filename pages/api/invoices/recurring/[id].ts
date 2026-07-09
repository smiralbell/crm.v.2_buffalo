import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'

const updateSchema = z.object({
  is_active: z.boolean().optional(),
  name: z.string().min(1).optional(),
  issue_day: z.number().int().min(1).max(31).optional(),
  due_day: z.number().int().min(1).max(31).nullable().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    const id = req.query.id
    if (typeof id !== 'string' || !id) {
      return res.status(400).json({ error: 'ID inválido' })
    }

    if (req.method === 'PATCH') {
      const data = updateSchema.parse(req.body)
      const sets: string[] = []
      const values: unknown[] = []

      if (data.is_active !== undefined) {
        values.push(data.is_active)
        sets.push(`is_active = $${values.length}`)
      }
      if (data.name !== undefined) {
        values.push(data.name.trim())
        sets.push(`name = $${values.length}`)
      }
      if (data.issue_day !== undefined) {
        values.push(data.issue_day)
        sets.push(`issue_day = $${values.length}`)
      }
      if (data.due_day !== undefined) {
        values.push(data.due_day)
        sets.push(`due_day = $${values.length}`)
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
