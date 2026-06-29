import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { EnableBankingApiError, EnableBankingConfigError } from '@/lib/enable-banking/client'
import { syncEnableBankingTransactions } from '@/lib/enable-banking/sync-transactions'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const result = await syncEnableBankingTransactions()
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof EnableBankingConfigError) {
      return res.status(503).json({ error: err.message })
    }
    if (err instanceof EnableBankingApiError) {
      return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: err.message,
      })
    }
    const msg = err instanceof Error ? err.message : 'Error al sincronizar'
    if (msg.includes('No hay conexión bancaria activa')) {
      return res.status(404).json({ error: 'no_session', message: msg })
    }
    return res.status(500).json({ error: msg })
  }
}
