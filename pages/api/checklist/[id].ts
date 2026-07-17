import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import {
  deleteChecklistItem,
  moveChecklistItem,
  updateChecklistItem,
} from '@/lib/checklist/store'
import { isChecklistColumnId } from '@/lib/checklist/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo admin' })
    }

    const id = parseInt(String(req.query.id), 10)
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID inválido' })
    }

    if (req.method === 'PATCH') {
      const { title, done, column_key, position } = req.body || {}

      if (column_key != null || position != null) {
        if (!isChecklistColumnId(column_key)) {
          return res.status(400).json({ error: 'Columna inválida' })
        }
        const item = await moveChecklistItem({
          id,
          column_key,
          position: typeof position === 'number' ? position : 0,
        })
        if (!item) return res.status(404).json({ error: 'No encontrado' })

        // Si solo mueven, y también mandan done/title, aplicar el resto
        if (title != null || done != null) {
          const updated = await updateChecklistItem(id, {
            title: typeof title === 'string' ? title : undefined,
            done: typeof done === 'boolean' ? done : undefined,
          })
          return res.status(200).json({ item: updated })
        }
        return res.status(200).json({ item })
      }

      const item = await updateChecklistItem(id, {
        title: typeof title === 'string' ? title : undefined,
        done: typeof done === 'boolean' ? done : undefined,
      })
      if (!item) return res.status(404).json({ error: 'No encontrado' })
      return res.status(200).json({ item })
    }

    if (req.method === 'DELETE') {
      const ok = await deleteChecklistItem(id)
      if (!ok) return res.status(404).json({ error: 'No encontrado' })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    const msg = error instanceof Error ? error.message : 'Error interno'
    if (msg.includes('título')) return res.status(400).json({ error: msg })
    console.error('[checklist/[id]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
