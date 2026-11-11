import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { findCrmUserById, listCrmUsers } from '@/lib/crm-users'
import { getAccessibleProjectIds, getUserProjects } from '@/lib/project-access'
import {
  createPersonalTask,
  listOpenProjects,
  listPersonalTasks,
  listProjectTasks,
} from '@/lib/tareas/store'
import { personalTaskCreateSchema } from '@/lib/tareas/schemas'
import type { TareasResponse, WorkPerson } from '@/lib/tareas/types'

/** Los comerciales no entran en Proyectos, así que no ven tareas de proyecto. */
const SEES_PROJECTS = new Set(['admin', 'developer', 'project_manager'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  const isAdmin = user.role === 'admin'

  try {
    if (req.method === 'GET') {
      // Admin puede mirar las tareas de cualquier usuario (?user_id=); el resto, solo las suyas.
      const requested = parseInt(String(req.query.user_id ?? ''), 10)
      let scopeUser: WorkPerson | null = null
      if (isAdmin && Number.isFinite(requested) && requested > 0) {
        const row = await findCrmUserById(requested)
        if (!row) return res.status(404).json({ error: 'Usuario no encontrado' })
        scopeUser = { id: row.id, name: row.name, role: row.role }
      } else if (!isAdmin) {
        scopeUser = { id: user.id, name: user.name, role: user.role }
      }

      const personal = await listPersonalTasks(scopeUser ? scopeUser.id : null)

      // Tareas de proyecto: las de los proyectos asignados al usuario que se mira.
      let projectIds: string[] | null = []
      if (!scopeUser) {
        projectIds = null // admin sin filtro: todos los proyectos abiertos
      } else if (SEES_PROJECTS.has(scopeUser.role) && SEES_PROJECTS.has(user.role)) {
        projectIds =
          scopeUser.id === user.id
            ? await getAccessibleProjectIds(user)
            : (await getUserProjects(scopeUser.id)).map((p) => p.id)
      }
      const projects = await listOpenProjects(projectIds)
      const projectTasks = await listProjectTasks(projects)

      const people: WorkPerson[] = isAdmin
        ? (await listCrmUsers())
            .filter((u) => u.active && u.role !== 'admin')
            .map((u) => ({ id: u.id, name: u.name, role: u.role }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        : []

      const body: TareasResponse = {
        tasks: [...personal, ...projectTasks],
        projects,
        people,
        me: { id: user.id, name: user.name, role: user.role },
        scope_user: scopeUser,
      }
      return res.status(200).json(body)
    }

    if (req.method === 'POST') {
      const data = personalTaskCreateSchema.parse(req.body)
      // Solo admin pone tareas a otros; el resto se las pone a sí mismo.
      const ownerId = isAdmin ? data.user_id : user.id
      if (!ownerId) return res.status(400).json({ error: 'Elige para quién es la tarea' })
      const owner = await findCrmUserById(ownerId)
      if (!owner || !owner.active) return res.status(400).json({ error: 'Usuario no válido' })

      const task = await createPersonalTask({
        user_id: owner.id,
        title: data.title,
        description: data.description?.trim() || null,
        status: data.status,
        priority: data.priority,
        estimated_hours: data.estimated_hours ?? null,
        due_date: data.due_date ?? null,
        subtasks: data.subtasks,
        created_by_id: user.id > 0 ? user.id : null,
        created_by_name: user.name,
      })
      return res.status(201).json(task)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[api/tareas]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
