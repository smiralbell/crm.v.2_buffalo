import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { buildUnifiedFunnel, type FunnelOrigin } from '@/lib/pipelines/unified-funnel'

/** GET /api/pipelines/embudo?origen=web|coldcall|otros → embudo único (solo lectura). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' })
  const raw = String(req.query.origen || '')
  const origen = (['web', 'coldcall', 'otros'] as const).includes(raw as FunnelOrigin) ? (raw as FunnelOrigin) : null
  try {
    return res.status(200).json(await buildUnifiedFunnel(origen))
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' })
  }
}
