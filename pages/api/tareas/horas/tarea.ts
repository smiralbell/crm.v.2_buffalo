import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { confirmTaskHours, getTaskHours } from '@/lib/horas/store'
import { getPersonalTask, getProjectTask } from '@/lib/tareas/store'
import type { WorkTask } from '@/lib/tareas/types'

const bodySchema = z.object({
  source: z.enum(['personal', 'project']),
  task_id: z.string().uuid(),
  hours: z.number().min(0).max(500),
})

/** La tarea es de esta persona: la tiene asignada o ha estado en curso a su nombre. */
function isMine(task: WorkTask, userId: number, tookPart: boolean): boolean {
  if (tookPart) return true
  if (task.source === 'personal') return task.owner_user_id === userId
  return (task.assignee_user_ids ?? []).includes(userId)
}

/**
 * GET ?source&task_id: horas calculadas (y confirmadas) de quien pregunta en esa tarea.
 * POST { source, task_id, hours }: confirma o corrige sus horas.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }

  try {
    if (req.method === 'GET') {
      const source = req.query.source === 'personal' ? 'personal' : 'project'
      const taskId = z.string().uuid().safeParse(req.query.task_id)
      if (!taskId.success) return res.status(400).json({ error: 'Tarea no válida' })
      const task = source === 'personal' ? await getPersonalTask(taskId.data) : await getProjectTask(taskId.data)
      if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
      const hours = await getTaskHours(user.id, taskId.data)
      return res.status(200).json({ ...hours, mine: isMine(task, user.id, hours.took_part) })
    }

    if (req.method === 'POST') {
      const body = bodySchema.parse(req.body ?? {})
      const task = body.source === 'personal' ? await getPersonalTask(body.task_id) : await getProjectTask(body.task_id)
      if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
      const current = await getTaskHours(user.id, body.task_id)
      if (!isMine(task, user.id, current.took_part)) {
        return res.status(403).json({ error: 'Solo puedes apuntar horas en tus tareas' })
      }
      await confirmTaskHours({
        userId: user.id,
        taskId: body.task_id,
        source: body.source,
        hours: Math.round(body.hours * 100) / 100,
        computed: current.computed,
        by: user.name || user.email,
      })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Datos no válidos' })
    console.error('[tareas/horas/tarea]', e)
    return res.status(500).json({ error: 'No se pudieron guardar las horas' })
  }
}
