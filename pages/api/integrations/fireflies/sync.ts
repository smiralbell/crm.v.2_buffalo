import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { isFirefliesConfigured } from '@/lib/integrations/fireflies/client'
import { syncRecentFirefliesMeetings } from '@/lib/integrations/fireflies/sync'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isFirefliesConfigured()) {
    return res.status(400).json({
      error: 'FIREFLIES_API_KEY no está configurada en el servidor',
    })
  }

  const limitRaw = Number(req.body?.limit ?? 20)
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20

  try {
    const result = await syncRecentFirefliesMeetings(limit)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error('[api/integrations/fireflies/sync]', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Error sincronizando',
    })
  }
}
