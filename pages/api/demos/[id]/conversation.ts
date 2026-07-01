import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getDemoById, getConversationDetail } from '@/lib/demos/store'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const id = parseInt(req.query.id as string, 10)
  const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : ''

  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' })
  }
  if (!phone) {
    return res.status(400).json({ error: 'Teléfono requerido' })
  }

  try {
    const demo = await getDemoById(id)
    if (!demo) return res.status(404).json({ error: 'Demo no encontrada' })

    const conversation = await getConversationDetail(id, phone)
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' })
    }

    return res.status(200).json(conversation)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (process.env.NODE_ENV === 'development') console.error('[demos/conversation GET]', err)
    return res.status(500).json({ error: msg })
  }
}
