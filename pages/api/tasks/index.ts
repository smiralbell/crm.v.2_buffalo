import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'

const createTaskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  description: z.string().optional().nullable(),
  assigneeId: z.number().int(),
  clientId: z.number().int(),
  project: z.string().min(1, 'El proyecto es obligatorio'),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  dueDate: z.string().optional().nullable(), // ISO date
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return // requireAuthAPI ya envió la respuesta 401
  }

  if (req.method === 'GET') {
    try {
      const {
        assigneeId,
        clientId,
        project,
        status,
        priority,
        onlyCompleted,
        onlyPending,
        orderByDue = 'asc',
        includeMeta,
      } = req.query

      const where: string[] = []
      const params: any[] = []

      if (assigneeId) {
        params.push(Number(assigneeId))
        where.push(`t.assignee_id = $${params.length}`)
      }

      if (clientId) {
        params.push(Number(clientId))
        where.push(`t.client_id = $${params.length}`)
      }

      if (project) {
        params.push(String(project))
        where.push(`t.project = $${params.length}`)
      }

      if (status) {
        params.push(String(status))
        where.push(`t.status = $${params.length}`)
      }

      if (priority) {
        params.push(String(priority))
        where.push(`t.priority = $${params.length}`)
      }

      if (onlyCompleted === '1') {
        where.push(`t.status = 'done'`)
      } else if (onlyPending === '1') {
        where.push(`t.status IN ('todo', 'doing')`)
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const orderDirection = orderByDue === 'desc' ? 'DESC' : 'ASC'

      const tasksResult = await query<{
        id: number
        title: string
        description: string | null
        project: string
        priority: string
        status: string
        due_date: string | null
        completed_at: string | null
        client_id: number
        client_name: string | null
        assignee_id: number
        assignee_name: string
      }>(
        `
        SELECT
          t.id,
          t.title,
          t.description,
          t.project,
          t.priority,
          t.status,
          t.due_date,
          t.completed_at,
          t.client_id,
          c.nombre AS client_name,
          t.assignee_id,
          tm.name AS assignee_name
        FROM tasks t
        JOIN contacts c ON c.id = t.client_id
        JOIN team_members tm ON tm.id = t.assignee_id
        ${whereSql}
        ORDER BY
          (t.due_date IS NULL) ASC,
          t.due_date ${orderDirection},
          t.priority DESC
        `,
        params
      )

      let meta: any = undefined

      if (includeMeta === '1') {
        const [teamMembersResult, clientsResult, projectsResult] = await Promise.all([
          query<{ id: number; name: string; color: string | null }>(
            `SELECT id, name, color FROM team_members WHERE active = TRUE ORDER BY name ASC`
          ),
          query<{ id: number; nombre: string | null }>(
            `SELECT id, nombre FROM contacts ORDER BY nombre ASC`
          ),
          query<{ project: string }>(
            `SELECT DISTINCT project FROM tasks ORDER BY project ASC`
          ),
        ])

        meta = {
          teamMembers: teamMembersResult.rows,
          clients: clientsResult.rows,
          projects: projectsResult.rows.map((p) => p.project),
        }
      }

      return res.status(200).json({
        tasks: tasksResult.rows,
        meta,
      })
    } catch (error) {
      console.error('[Tasks API] Error fetching tasks:', error)
      return res.status(500).json({ error: 'Error al obtener tareas' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createTaskSchema.parse(req.body)

      const params = [
        data.clientId,
        data.assigneeId,
        data.title,
        data.description || null,
        data.project,
        data.priority,
        data.status || 'todo',
        data.dueDate ? data.dueDate : null,
      ]

      const insertResult = await query<{
        id: number
      }>(
        `
        INSERT INTO tasks
          (client_id, assignee_id, title, description, project, priority, status, due_date)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        `,
        params
      )

      const newId = insertResult.rows[0]?.id

      return res.status(201).json({ id: newId })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      console.error('[Tasks API] Error creating task:', error)
      return res.status(500).json({ error: 'Error al crear tarea' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}


