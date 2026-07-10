import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { serializeTaskRow } from '@/lib/gestion-proyecto/task-stale'
import { prisma } from '@/lib/prisma'

const createTaskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'buffalo_validation', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignee: z.string().optional(),
  estimated_hours: z.number().positive().optional(),
})

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
        tasks: rows.map((t) => {
          const serialized = serializeTaskRow(t)
          return {
            ...serialized,
            created_at:
              t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
            updated_at:
              t.updated_at instanceof Date ? t.updated_at.toISOString() : String(t.updated_at),
          }
        }),
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

      try {
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
        const task = rows[0]
        const serialized = serializeTaskRow(task)
        return res.status(201).json({
          ...serialized,
          created_at:
            task.created_at instanceof Date
              ? task.created_at.toISOString()
              : String(task.created_at),
          updated_at:
            task.updated_at instanceof Date
              ? task.updated_at.toISOString()
              : String(task.updated_at),
        })
      } catch (insertError) {
        const msg = insertError instanceof Error ? insertError.message : ''
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
        const task = rows[0]
        const serialized = serializeTaskRow(task)
        return res.status(201).json({
          ...serialized,
          estimated_hours: data.estimated_hours ?? null,
          created_at:
            task.created_at instanceof Date
              ? task.created_at.toISOString()
              : String(task.created_at),
          updated_at:
            task.updated_at instanceof Date
              ? task.updated_at.toISOString()
              : String(task.updated_at),
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
