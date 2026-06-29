import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { buildExecutiveSummary } from '@/lib/finance/executive-summary'

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
    const summary = await buildExecutiveSummary()
    return res.status(200).json(summary)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al generar resumen ejecutivo'
    console.error('[finance/executive-summary]', err)
    return res.status(500).json({ error: msg })
  }
}
