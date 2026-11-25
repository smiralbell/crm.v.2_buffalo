import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { getAccessibleProjectIds } from '@/lib/project-access'
import { TaskMoveError, getPersonalTask, getProjectTask, moveTaskToProject } from '@/lib/tareas/store'

const bodySchema = z.object({
  source: z.enum(['personal', 'project']),
  task_id: z.string().uuid(),
  project_id: z.string().uuid('Elige un proyecto'),
})

/** POST: asocia una tarea (suelta o de otro proyecto) a un proyecto. */
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
    const allowed = await getAccessibleProjectIds(user)
    const canUse = (projectId: string) => allowed === null || allowed.includes(projectId)
    if (!canUse(body.project_id)) return res.status(403).json({ error: 'No tienes acceso a ese proyecto' })

    const task = body.source === 'personal' ? await getPersonalTask(body.task_id) : await getProjectTask(body.task_id)
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.source === 'personal' && user.role !== 'admin' && task.owner_user_id !== user.id) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }
    if (task.source === 'project' && !canUse(task.project_id)) {
      return res.status(403).json({ error: 'No tienes acceso al proyecto de esta tarea' })
    }

    const moved = await moveTaskToProject(task, body.project_id)
    return res.status(200).json({ task: moved, previous_id: task.id })
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    if (error instanceof TaskMoveError) return res.status(400).json({ error: error.message })
    console.error('[api/tareas/mover]', error)
    return res.status(500).json({ error: 'No se pudo cambiar de proyecto' })
  }
}
