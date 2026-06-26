import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  listAspsps,
  EnableBankingApiError,
  EnableBankingConfigError,
} from '@/lib/enable-banking/client'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  try {
    const aspsps = await listAspsps('ES')
    return res.status(200).json({ aspsps })
  } catch (err) {
    if (err instanceof EnableBankingConfigError) {
      return res.status(503).json({ error: err.message })
    }
    if (err instanceof EnableBankingApiError) {
      return res.status(500).json({ error: err.message, details: err.detail })
    }
    const msg = err instanceof Error ? err.message : 'Error al obtener listado de bancos'
    if (process.env.NODE_ENV === 'development') console.error('[bank/test/banks]', err)
    return res.status(500).json({ error: msg })
  }
}
