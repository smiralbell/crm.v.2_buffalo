import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)
  } catch (error) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const statementId = req.query.statement_id as string

    if (!statementId) {
      return res.status(400).json({ error: 'statement_id es requerido' })
    }

    // Obtener transacciones del extracto
    const result = await query<{
      id: string
      date: string
      amount: number
      description: string
      balance: number | null
      created_at: string
    }>(
      `SELECT id, date, amount, description, balance, created_at
       FROM bank_transactions
       WHERE statement_id = $1
       ORDER BY date DESC, created_at DESC`,
      [statementId]
    )

    return res.status(200).json({
      transactions: result.rows.map((t) => ({
        ...t,
        amount: Number(t.amount),
        balance: t.balance ? Number(t.balance) : null,
        date: t.date,
      })),
    })
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error fetching transactions:', error)
    }
    return res.status(500).json({
      error: error.message || 'Error al obtener transacciones',
    })
  }
}

