import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { deletePersonalTask, getPersonalTask, updatePersonalTask } from '@/lib/tareas/store'
import { personalTaskUpdateSchema } from '@/lib/tareas/schemas'
import { canDeletePersonalTask } from '@/lib/tareas/permissions'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  const id = String(req.query.id ?? '')
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID no válido' })

  try {
    const task = await getPersonalTask(id)
    // Cada uno ve y toca solo sus tareas sueltas; admin, todas.
    if (!task || (user.role !== 'admin' && task.owner_user_id !== user.id)) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }

    if (req.method === 'PATCH') {
      const patch = personalTaskUpdateSchema.parse(req.body)
      const updated = await updatePersonalTask(task, patch)
      if (!updated) return res.status(404).json({ error: 'Tarea no encontrada' })
      return res.status(200).json(updated)
    }

    if (req.method === 'DELETE') {
      if (!canDeletePersonalTask(user, task)) {
        return res
          .status(403)
          .json({ error: 'Esta tarea te la asignaron. Muévela a Hecho; solo quien la creó puede borrarla.' })
      }
      await deletePersonalTask(id)
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[api/tareas/[id]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
