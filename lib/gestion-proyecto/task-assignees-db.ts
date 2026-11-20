import { prisma } from '@/lib/prisma'
import {
  canViewerSeeProjectTask,
  joinAssigneeNames,
  seesAllProjectTasks,
  type AssignableTask,
  type TaskViewer,
} from '@/lib/gestion-proyecto/task-assignees'

let columnReady: Promise<void> | null = null

/** Crea la columna `assignee_user_ids` si aún no existe (idempotente). */
export function ensureTaskAssigneesColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = prisma
      .$executeRawUnsafe(
        `ALTER TABLE project_dev_tasks ADD COLUMN IF NOT EXISTS assignee_user_ids INTEGER[] NOT NULL DEFAULT '{}'`
      )
      .then(() => undefined)
      .catch((e) => {
        columnReady = null
        throw e
      })
  }
  return columnReady
}

/**
 * Developers de cada proyecto (sin contar admin ni project manager), para saber
 * si alguien es el único y puede ver las tareas sin asignar.
 */
export async function countProjectDevelopers(projectIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (projectIds.length === 0) return out
  try {
    const rows = await prisma.$queryRaw<{ project_id: string; n: number }[]>`
      SELECT up.project_id::text AS project_id, COUNT(*)::int AS n
      FROM crm_user_projects up
      JOIN crm_users u ON u.id = up.user_id
      WHERE up.project_id = ANY(${projectIds}::uuid[])
        AND u.active = TRUE
        AND u.role NOT IN ('admin', 'project_manager')
      GROUP BY up.project_id
    `
    for (const r of rows) out.set(r.project_id, Number(r.n))
  } catch {
    // tabla opcional
  }
  return out
}

/** Deja solo las tareas que le tocan a quien mira (admin y PM, todas). */
export async function filterProjectTasksForViewer<T extends AssignableTask & { project_id: string }>(
  tasks: T[],
  viewer: TaskViewer
): Promise<T[]> {
  if (seesAllProjectTasks(viewer.role) || tasks.length === 0) return tasks
  const counts = await countProjectDevelopers(Array.from(new Set(tasks.map((t) => t.project_id))))
  return tasks.filter((t) => canViewerSeeProjectTask(t, viewer, counts.get(t.project_id) ?? 0))
}

export async function canViewerSeeTask(
  task: AssignableTask & { project_id: string },
  viewer: TaskViewer
): Promise<boolean> {
  return (await filterProjectTasksForViewer([task], viewer)).length > 0
}

/** Guarda los ids de los asignados y devuelve la fila actualizada. */
export async function saveTaskAssigneeIds(
  taskId: string,
  ids: number[]
): Promise<Record<string, unknown> | null> {
  await ensureTaskAssigneesColumn()
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE project_dev_tasks SET assignee_user_ids = ${ids}::int[]
    WHERE id = ${taskId}::uuid
    RETURNING *
  `
  return rows[0] ?? null
}

/** Lo que llega del formulario para decir a quién va la tarea. */
export interface AssigneesBody {
  /** Usuarios del CRM elegidos */
  assignee_user_ids?: number[]
  /** Nombres que no son usuarios (tareas antiguas); solo con assignee_user_ids */
  extra_assignees?: string[]
  /** Texto libre (agentes, versiones antiguas): borra los ids */
  assignee?: string | null
}

/** undefined = no se toca quién la tiene. */
export async function assigneesFromBody(
  body: AssigneesBody
): Promise<{ ids: number[]; text: string | null } | undefined> {
  if (body.assignee_user_ids !== undefined) {
    return resolveAssignees(body.assignee_user_ids, body.extra_assignees ?? [])
  }
  if (body.assignee !== undefined) {
    return { ids: [], text: joinAssigneeNames([body.assignee ?? '']) }
  }
  return undefined
}

/**
 * A quién va una tarea: solo usuarios activos. Devuelve los ids válidos y el
 * texto que se enseña (sus nombres, más los nombres sueltos que no son usuarios).
 */
export async function resolveAssignees(
  userIds: number[],
  extraNames: string[] = []
): Promise<{ ids: number[]; text: string | null }> {
  const wanted = Array.from(new Set(userIds.filter((n) => Number.isInteger(n) && n > 0)))
  let users: { id: number; name: string }[] = []
  if (wanted.length) {
    users = await prisma.$queryRaw<{ id: number; name: string }[]>`
      SELECT id, name FROM crm_users WHERE id = ANY(${wanted}::int[]) AND active = TRUE
    `
    users.sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id))
  }
  return {
    ids: users.map((u) => u.id),
    text: joinAssigneeNames([...users.map((u) => u.name), ...extraNames]),
  }
}
