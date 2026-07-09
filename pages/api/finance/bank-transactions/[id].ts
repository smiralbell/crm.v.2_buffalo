import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'

const patchSchema = z.object({
  is_recurring_income: z.boolean(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return res.status(401).json({ error: 'No autorizado' })
  }

  const id = req.query.id
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method === 'PATCH') {
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() })
    }

    try {
      const result = await query<{ id: string; is_recurring_income: boolean }>(
        `UPDATE bank_transactions
         SET is_recurring_income = $1
         WHERE id = $2
         RETURNING id, is_recurring_income`,
        [parsed.data.is_recurring_income, id]
      )

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Movimiento no encontrado' })
      }

      return res.status(200).json({
        ok: true,
        id: result.rows[0].id,
        is_recurring_income: result.rows[0].is_recurring_income,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al actualizar'
      if (message.includes('is_recurring_income')) {
        return res.status(500).json({
          error: 'Falta la columna is_recurring_income. Ejecuta prisma/ALTER_BANK_TRANSACTIONS_RECURRING.sql',
        })
      }
      return res.status(500).json({ error: message })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await query(
        `UPDATE invoices SET bank_transaction_id = NULL, updated_at = NOW()
         WHERE bank_transaction_id = $1`,
        [id]
      )

      const deleted = await query<{ id: string }>(
        `DELETE FROM bank_transactions WHERE id = $1 RETURNING id`,
        [id]
      )

      if (!deleted.rows[0]) {
        return res.status(404).json({ error: 'Movimiento no encontrado' })
      }

      return res.status(200).json({ ok: true, id: deleted.rows[0].id })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar'
      return res.status(500).json({ error: message })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
