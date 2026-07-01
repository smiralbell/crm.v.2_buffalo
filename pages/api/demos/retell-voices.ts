import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { RetellApiError, retellListVoices } from '@/lib/demos/retell'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const voices = await retellListVoices()
    return res.status(200).json({ voices })
  } catch (err) {
    const msg =
      err instanceof RetellApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Error al cargar voces'
    if (process.env.NODE_ENV === 'development') console.error('[demos/retell-voices]', err)
    return res.status(500).json({ error: msg })
  }
}
