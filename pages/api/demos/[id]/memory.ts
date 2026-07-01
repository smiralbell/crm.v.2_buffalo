import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { clearDemoMemory, getDemoById } from '@/lib/demos/store'

/** POST /api/demos/[id]/memory — borra historial de conversaciones de la demo */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const demo = await getDemoById(id)
    if (!demo) return res.status(404).json({ error: 'Demo no encontrada' })

    const cleared = await clearDemoMemory(id)
    return res.status(200).json({
      ok: true,
      cleared_conversations: cleared,
      message: 'Memoria borrada. Las próximas pruebas empezarán desde cero.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (process.env.NODE_ENV === 'development') console.error('[demos/[id]/memory]', err)
    return res.status(500).json({ error: msg })
  }
}
