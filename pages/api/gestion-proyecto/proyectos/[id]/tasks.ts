import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { serializeTaskRow } from '@/lib/gestion-proyecto/task-stale'
import { prisma } from '@/lib/prisma'

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .optional()
  .nullable()

const createTaskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'buffalo_validation', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignee: z.string().optional(),
  estimated_hours: z.number().positive().optional(),
  due_date: dueDateSchema,
})

function formatTask(task: Record<string, unknown>) {
  const serialized = serializeTaskRow(task)
  return {
    ...serialized,
    estimated_hours: task.estimated_hours ?? null,
    due_date: serialized.due_date ?? null,
    created_at:
      task.created_at instanceof Date ? task.created_at.toISOString() : String(task.created_at),
    updated_at:
      task.updated_at instanceof Date ? task.updated_at.toISOString() : String(task.updated_at),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  if (!projectId) return res.status(400).json({ error: 'ID de proyecto requerido' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method === 'GET') {
      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT *
        FROM project_dev_tasks
        WHERE project_id = ${projectId}::uuid
        ORDER BY position ASC, created_at ASC
      `
      return res.status(200).json({
        tasks: rows.map((t) => formatTask(t)),
      })
    }

    if (req.method === 'POST') {
      const data = createTaskSchema.parse(req.body)
      const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
        SELECT MAX(position)::int AS max_pos
        FROM project_dev_tasks
        WHERE project_id = ${projectId}::uuid
          AND status = ${data.status || 'pending'}
      `
      const position = (maxPos[0]?.max_pos ?? -1) + 1
      const dueDate = data.due_date ?? null

      try {
        const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
          INSERT INTO project_dev_tasks (
            project_id, title, description, status, priority, assignee, estimated_hours, due_date, position, status_changed_at
          ) VALUES (
            ${projectId}::uuid,
            ${data.title},
            ${data.description ?? null},
            ${data.status || 'pending'},
            ${data.priority || 'medium'},
            ${data.assignee ?? null},
            ${data.estimated_hours ?? null},
            ${dueDate}::date,
            ${position},
            NOW()
          )
          RETURNING *
        `
        return res.status(201).json(formatTask(rows[0]))
      } catch (insertError) {
        const msg = insertError instanceof Error ? insertError.message : ''
        if (msg.includes('due_date')) {
          const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
            INSERT INTO project_dev_tasks (
              project_id, title, description, status, priority, assignee, estimated_hours, position, status_changed_at
            ) VALUES (
              ${projectId}::uuid,
              ${data.title},
              ${data.description ?? null},
              ${data.status || 'pending'},
              ${data.priority || 'medium'},
              ${data.assignee ?? null},
              ${data.estimated_hours ?? null},
              ${position},
              NOW()
            )
            RETURNING *
          `
          return res.status(201).json({ ...formatTask(rows[0]), due_date: dueDate })
        }
        if (!msg.includes('estimated_hours') && !msg.includes('status_changed_at')) throw insertError
        const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
          INSERT INTO project_dev_tasks (
            project_id, title, description, status, priority, assignee, position
          ) VALUES (
            ${projectId}::uuid,
            ${data.title},
            ${data.description ?? null},
            ${data.status || 'pending'},
            ${data.priority || 'medium'},
            ${data.assignee ?? null},
            ${position}
          )
          RETURNING *
        `
        return res.status(201).json({
          ...formatTask(rows[0]),
          estimated_hours: data.estimated_hours ?? null,
          due_date: dueDate,
        })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[gestion-proyecto/tasks]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
