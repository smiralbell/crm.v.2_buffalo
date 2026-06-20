import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  getAccountBalances,
  getAccountTransactions,
  EnableBankingApiError,
  EnableBankingConfigError,
} from '@/lib/enable-banking/client'
import { getLatestAccountUid, getLatestBankTestSession } from '@/lib/enable-banking/session-store'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const accountUid = getLatestAccountUid()
  if (!accountUid) {
    return res.status(404).json({
      error: 'No hay sesión bancaria de prueba. Conecta el banco primero.',
    })
  }

  try {
    const [balances, transactions] = await Promise.all([
      getAccountBalances(accountUid),
      getAccountTransactions(accountUid),
    ])

    return res.status(200).json({
      account_uid: accountUid,
      session: getLatestBankTestSession(),
      balances,
      transactions,
    })
  } catch (err) {
    if (err instanceof EnableBankingConfigError) {
      return res.status(503).json({ error: err.message })
    }
    if (err instanceof EnableBankingApiError) {
      return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: err.message,
      })
    }
    const msg = err instanceof Error ? err.message : 'Error al obtener datos bancarios'
    if (process.env.NODE_ENV === 'development') console.error('[bank/test/data]', err)
    return res.status(500).json({ error: msg })
  }
}
