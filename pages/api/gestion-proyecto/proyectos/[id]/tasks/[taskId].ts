import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { STALE_EXTENSION_DAYS, serializeTaskRow } from '@/lib/gestion-proyecto/task-stale'
import { prisma } from '@/lib/prisma'

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'buffalo_validation', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignee: z.string().nullable().optional(),
  estimated_hours: z.number().positive().nullable().optional(),
  position: z.number().int().optional(),
  extend_stale: z.boolean().optional(),
  acknowledge_stale: z.boolean().optional(),
})

function formatTaskResponse(task: Record<string, unknown>) {
  const serialized = serializeTaskRow(task)
  return {
    ...serialized,
    estimated_hours: task.estimated_hours ?? null,
    created_at:
      task.created_at instanceof Date ? task.created_at.toISOString() : String(task.created_at),
    updated_at:
      task.updated_at instanceof Date ? task.updated_at.toISOString() : String(task.updated_at),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const taskId = req.query.taskId as string
  if (!projectId || !taskId) return res.status(400).json({ error: 'IDs requeridos' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method === 'PATCH') {
      const data = updateTaskSchema.parse(req.body)

      let currentRows: Record<string, unknown>[]
      try {
        currentRows = await prisma.$queryRaw`
          SELECT *
          FROM project_dev_tasks
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          LIMIT 1
        `
      } catch {
        return res.status(404).json({ error: 'Tarea no encontrada' })
      }
      const current = currentRows[0]
      if (!current) return res.status(404).json({ error: 'Tarea no encontrada' })

      if (data.extend_stale) {
        const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
          UPDATE project_dev_tasks SET
            stale_extension_until = NOW() + (${STALE_EXTENSION_DAYS}::int * INTERVAL '1 day'),
            stale_notice_active = TRUE,
            updated_at = NOW()
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          RETURNING *
        `
        return res.status(200).json(formatTaskResponse(rows[0]))
      }

      if (data.acknowledge_stale) {
        const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
          UPDATE project_dev_tasks SET
            stale_notice_active = FALSE,
            stale_extension_until = NULL,
            status_changed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          RETURNING *
        `
        return res.status(200).json(formatTaskResponse(rows[0]))
      }

      const nextStatus = (data.status ?? current.status) as string
      let nextPosition = data.position ?? (current.position as number)
      const statusChanged = data.status && data.status !== current.status

      if (statusChanged && data.position == null) {
        const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
          SELECT MAX(position)::int AS max_pos
          FROM project_dev_tasks
          WHERE project_id = ${projectId}::uuid AND status = ${nextStatus}
        `
        nextPosition = (maxPos[0]?.max_pos ?? -1) + 1
      }

      const nextEstimatedHours =
        data.estimated_hours !== undefined ? data.estimated_hours : (current.estimated_hours ?? null)

      try {
        const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
          UPDATE project_dev_tasks SET
            title = ${data.title ?? (current.title as string)},
            description = ${data.description !== undefined ? data.description : (current.description as string | null)},
            status = ${nextStatus},
            priority = ${data.priority ?? (current.priority as string)},
            assignee = ${data.assignee !== undefined ? data.assignee : (current.assignee as string | null)},
            estimated_hours = ${nextEstimatedHours},
            position = ${nextPosition},
            status_changed_at = CASE WHEN ${Boolean(statusChanged)} THEN NOW() ELSE status_changed_at END,
            stale_notice_active = CASE WHEN ${Boolean(statusChanged)} THEN FALSE ELSE stale_notice_active END,
            stale_extension_until = CASE WHEN ${Boolean(statusChanged)} THEN NULL ELSE stale_extension_until END,
            updated_at = NOW()
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          RETURNING *
        `
        return res.status(200).json(formatTaskResponse(rows[0]))
      } catch (updateError) {
        const msg = updateError instanceof Error ? updateError.message : ''
        if (!msg.includes('estimated_hours') && !msg.includes('status_changed_at')) throw updateError
        const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
          UPDATE project_dev_tasks SET
            title = ${data.title ?? (current.title as string)},
            description = ${data.description !== undefined ? data.description : (current.description as string | null)},
            status = ${nextStatus},
            priority = ${data.priority ?? (current.priority as string)},
            assignee = ${data.assignee !== undefined ? data.assignee : (current.assignee as string | null)},
            position = ${nextPosition},
            updated_at = NOW()
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          RETURNING *
        `
        return res.status(200).json(formatTaskResponse(rows[0]))
      }
    }

    if (req.method === 'DELETE') {
      await prisma.$executeRaw`
        DELETE FROM project_dev_tasks
        WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
      `
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[gestion-proyecto/tasks/[taskId]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
