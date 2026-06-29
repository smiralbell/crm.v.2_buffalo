import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  startAuthorization,
  EnableBankingApiError,
  EnableBankingConfigError,
} from '@/lib/enable-banking/client'
import { getEnableBankingAspspName } from '@/lib/enable-banking/config'

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
    const bank = getEnableBankingAspspName()
    const result = await startAuthorization(bank)

    if (!result.url) {
      return res.status(502).json({ error: 'Enable Banking no devolvió URL de autorización' })
    }

    return res.status(200).json({ url: result.url, bank })
  } catch (err) {
    if (err instanceof EnableBankingConfigError) {
      return res.status(503).json({ error: err.message })
    }
    if (err instanceof EnableBankingApiError) {
      return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: err.message,
      })
    }
    const msg = err instanceof Error ? err.message : 'Error al iniciar conexión bancaria'
    if (process.env.NODE_ENV === 'development') console.error('[bank/test/start]', err)
    return res.status(500).json({ error: msg })
  }
}
