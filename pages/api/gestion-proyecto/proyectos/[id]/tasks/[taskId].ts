import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignee: z.string().nullable().optional(),
  estimated_hours: z.number().positive().nullable().optional(),
  position: z.number().int().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const taskId = req.query.taskId as string
  if (!projectId || !taskId) return res.status(400).json({ error: 'IDs requeridos' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method === 'PATCH') {
      const data = updateTaskSchema.parse(req.body)

      let currentRows: {
        title: string
        description: string | null
        status: string
        priority: string
        assignee: string | null
        estimated_hours: number | null
        position: number
      }[]
      try {
        currentRows = await prisma.$queryRaw`
          SELECT title, description, status, priority, assignee, estimated_hours::float AS estimated_hours, position
          FROM project_dev_tasks
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          LIMIT 1
        `
      } catch {
        const rows = await prisma.$queryRaw<
          {
            title: string
            description: string | null
            status: string
            priority: string
            assignee: string | null
            position: number
          }[]
        >`
          SELECT title, description, status, priority, assignee, position
          FROM project_dev_tasks
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          LIMIT 1
        `
        currentRows = rows.map((r) => ({ ...r, estimated_hours: null }))
      }
      const current = currentRows[0]
      if (!current) return res.status(404).json({ error: 'Tarea no encontrada' })

      const nextStatus = data.status ?? current.status
      let nextPosition = data.position ?? current.position

      if (data.status && data.status !== current.status && data.position == null) {
        const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
          SELECT MAX(position)::int AS max_pos
          FROM project_dev_tasks
          WHERE project_id = ${projectId}::uuid AND status = ${nextStatus}
        `
        nextPosition = (maxPos[0]?.max_pos ?? -1) + 1
      }

      const nextEstimatedHours =
        data.estimated_hours !== undefined ? data.estimated_hours : current.estimated_hours

      let rows: {
        id: string
        project_id: string
        title: string
        description: string | null
        status: string
        priority: string
        assignee: string | null
        estimated_hours?: number | null
        position: number
        created_at: Date
        updated_at: Date
      }[]
      try {
        rows = await prisma.$queryRaw`
          UPDATE project_dev_tasks SET
            title = ${data.title ?? current.title},
            description = ${data.description !== undefined ? data.description : current.description},
            status = ${nextStatus},
            priority = ${data.priority ?? current.priority},
            assignee = ${data.assignee !== undefined ? data.assignee : current.assignee},
            estimated_hours = ${nextEstimatedHours},
            position = ${nextPosition},
            updated_at = NOW()
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          RETURNING *
        `
      } catch (updateError) {
        const msg = updateError instanceof Error ? updateError.message : ''
        if (!msg.includes('estimated_hours')) throw updateError
        rows = await prisma.$queryRaw`
          UPDATE project_dev_tasks SET
            title = ${data.title ?? current.title},
            description = ${data.description !== undefined ? data.description : current.description},
            status = ${nextStatus},
            priority = ${data.priority ?? current.priority},
            assignee = ${data.assignee !== undefined ? data.assignee : current.assignee},
            position = ${nextPosition},
            updated_at = NOW()
          WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
          RETURNING *
        `
      }

      const task = rows[0]
      return res.status(200).json({
        ...task,
        estimated_hours: task.estimated_hours ?? null,
        created_at: task.created_at.toISOString(),
        updated_at: task.updated_at.toISOString(),
      })
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
