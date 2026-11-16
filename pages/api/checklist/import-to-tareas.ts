import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { getChecklistImportPreview, importChecklistToTareas } from '@/lib/checklist/import-to-tareas'

/**
 * GET  /api/checklist/import-to-tareas → cuántas hay en cada columna, usuarios y sugerencia
 * POST /api/checklist/import-to-tareas → { map: { inbox, santi, sergi }, include_done }
 */
const owner = z.number().int().positive().nullable()
const bodySchema = z.object({
  map: z.object({ inbox: owner, santi: owner, sergi: owner }),
  include_done: z.boolean().default(false),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getChecklistImportPreview())
    }
    if (req.method === 'POST') {
      const parsed = bodySchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' })
      const { map, include_done } = parsed.data
      if (!map.inbox && !map.santi && !map.sergi) {
        return res.status(400).json({ error: 'Elige al menos a quién pasar una columna' })
      }
      const result = await importChecklistToTareas({
        map,
        includeDone: include_done,
        actor: { id: user.id, name: user.name },
      })
      return res.status(200).json(result)
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (error) {
    console.error('[checklist/import-to-tareas]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno' })
  }
}
