import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'

const updateTaskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  description: z.string().optional().nullable(),
  assigneeId: z.number().int(),
  clientId: z.number().int(),
  project: z.string().min(1, 'El proyecto es obligatorio'),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['todo', 'doing', 'done']),
  dueDate: z.string().optional().nullable(),
})

const patchTaskSchema = z.object({
  status: z.enum(['todo', 'doing', 'done']).optional(),
  markDone: z.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = Number(req.query.id)
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method === 'PUT') {
    try {
      const data = updateTaskSchema.parse(req.body)

      const params = [
        data.clientId,
        data.assigneeId,
        data.title,
        data.description || null,
        data.project,
        data.priority,
        data.status,
        data.dueDate ? data.dueDate : null,
        id,
      ]

      await query(
        `
        UPDATE tasks
        SET
          client_id = $1,
          assignee_id = $2,
          title = $3,
          description = $4,
          project = $5,
          priority = $6,
          status = $7,
          due_date = $8,
          updated_at = now(),
          completed_at = CASE
            WHEN $7 = 'done' THEN COALESCE(completed_at, now())
            ELSE NULL
          END
        WHERE id = $9
        `,
        params
      )

      return res.status(200).json({ success: true })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      console.error('[Tasks API] Error updating task:', error)
      return res.status(500).json({ error: 'Error al actualizar tarea' })
    }
  }

  if (req.method === 'PATCH') {
    try {
      const data = patchTaskSchema.parse(req.body || {})

      const markDone = data.markDone === true
      const newStatus = data.status || (markDone ? 'done' : undefined)

      if (!newStatus) {
        return res.status(400).json({ error: 'Nada que actualizar' })
      }

      const params = [newStatus, id]

      await query(
        `
        UPDATE tasks
        SET
          status = $1,
          updated_at = now(),
          completed_at = CASE
            WHEN $1 = 'done' THEN COALESCE(completed_at, now())
            ELSE NULL
          END
        WHERE id = $2
        `,
        params
      )

      return res.status(200).json({ success: true })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      console.error('[Tasks API] Error patching task:', error)
      return res.status(500).json({ error: 'Error al actualizar tarea' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await query(`DELETE FROM tasks WHERE id = $1`, [id])
      return res.status(200).json({ success: true })
    } catch (error) {
      console.error('[Tasks API] Error deleting task:', error)
      return res.status(500).json({ error: 'Error al eliminar tarea' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}


