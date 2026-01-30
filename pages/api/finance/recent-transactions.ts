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
    const limit = parseInt(req.query.limit as string) || 10
    const offset = parseInt(req.query.offset as string) || 0
    const startDate = req.query.start_date as string
    const endDate = req.query.end_date as string

    // Construir query con filtro de fechas si está presente (sin fecha mínima)
    let dateFilter = ''
    const queryParams: any[] = []

    if (startDate && endDate) {
      dateFilter = 'WHERE bt.date >= $1 AND bt.date <= $2'
      queryParams.push(startDate, endDate)
    } else if (startDate) {
      dateFilter = 'WHERE bt.date >= $1'
      queryParams.push(startDate)
    } else if (endDate) {
      dateFilter = 'WHERE bt.date <= $1'
      queryParams.push(endDate)
    }

    // Obtener transacciones más recientes de todas las cuentas
    const result = await query<{
      id: string
      date: string
      amount: number
      description: string
      balance: number | null
      account_name: string
      iban: string
      created_at: string
    }>(
      `SELECT 
        bt.id,
        bt.date,
        bt.amount,
        bt.description,
        bt.balance,
        ba.name as account_name,
        ba.iban,
        bt.created_at
       FROM bank_transactions bt
       JOIN bank_accounts ba ON bt.account_id = ba.id
       ${dateFilter}
       ORDER BY bt.date DESC, bt.created_at DESC
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, limit, offset]
    )

    // Obtener el total de transacciones para saber si hay más
    const countQuery = `SELECT COUNT(*) as count FROM bank_transactions bt ${dateFilter}`
    const countResult = await query<{ count: string }>(countQuery, queryParams)
    const total = parseInt(countResult.rows[0].count)

    return res.status(200).json({
      transactions: result.rows.map((t) => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        description: t.description,
        balance: t.balance ? Number(t.balance) : null,
        account_name: t.account_name,
        iban: t.iban,
        created_at: t.created_at,
      })),
      hasMore: offset + limit < total,
      total,
    })
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error fetching recent transactions:', error)
    }
    return res.status(500).json({
      error: error.message || 'Error al obtener movimientos',
    })
  }
}

