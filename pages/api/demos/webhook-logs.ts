import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { listDemoWebhookLogs } from '@/lib/demos/webhook-log'

/** GET /api/demos/webhook-logs — últimos eventos del webhook (solo admin) */
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
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 80, 200)
    const logs = await listDemoWebhookLogs(limit)
    return res.status(200).json({ logs })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (process.env.NODE_ENV === 'development') console.error('[demos/webhook-logs]', err)
    return res.status(500).json({ error: msg })
  }
}
