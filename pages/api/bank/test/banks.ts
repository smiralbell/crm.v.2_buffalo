import type { NextApiRequest, NextApiResponse } from 'next'
import { createEnableBankingJwt } from '@/lib/enable-banking/jwt'

const ASPSPS_URL = 'https://api.enablebanking.com/aspsps?country=ES&psu_type=business&service=AIS'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const token = createEnableBankingJwt()

    const response = await fetch(ASPSPS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })

    const body = await response.json()

    if (!response.ok) {
      return res.status(500).json({
        error: `Enable Banking respondió ${response.status}`,
        details: body,
      })
    }

    return res.status(200).json(body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al obtener listado de bancos'
    if (process.env.NODE_ENV === 'development') console.error('[bank/test/banks]', err)
    return res.status(500).json({ error: msg })
  }
}
