import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { getAccessibleProjectIds } from '@/lib/project-access'
import { getPersonalTask, getProjectTask, setTaskResponse } from '@/lib/tareas/store'

const bodySchema = z.object({
  source: z.enum(['personal', 'project']),
  task_id: z.string().uuid(),
  response: z.string().max(5000, 'Respuesta demasiado larga'),
})

/** POST: quien tiene la tarea deja una respuesta para quien la puso (vacía = quitarla). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = bodySchema.parse(req.body ?? {})
    const task = body.source === 'personal' ? await getPersonalTask(body.task_id) : await getProjectTask(body.task_id)
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })

    if (task.source === 'personal') {
      const isOwner = task.owner_user_id === user.id
      const isCreator = task.created_by_id === user.id
      if (user.role !== 'admin' && !isOwner && !isCreator) return res.status(404).json({ error: 'Tarea no encontrada' })
    } else {
      const allowed = await getAccessibleProjectIds(user)
      if (allowed !== null && !allowed.includes(task.project_id)) {
        return res.status(403).json({ error: 'No tienes acceso a esta tarea' })
      }
    }

    const updated = await setTaskResponse(task, body.response, user.name || user.email)
    return res.status(200).json({ task: updated })
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    console.error('[api/tareas/respuesta]', error)
    return res.status(500).json({ error: 'No se pudo guardar la respuesta' })
  }
}
