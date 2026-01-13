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
    // Obtener el último extracto importado
    const result = await query<{
      period_end: string
      uploaded_at: string
    }>(
      `SELECT period_end, uploaded_at
       FROM bank_statements
       ORDER BY uploaded_at DESC
       LIMIT 1`
    )

    if (result.rows.length === 0) {
      return res.status(200).json({
        has_statements: false,
        last_date: null,
      })
    }

    return res.status(200).json({
      has_statements: true,
      last_date: result.rows[0].period_end,
      uploaded_at: result.rows[0].uploaded_at,
    })
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR] Error fetching latest statement:', error)
    }
    return res.status(500).json({
      error: error.message || 'Error al obtener último extracto',
    })
  }
}

