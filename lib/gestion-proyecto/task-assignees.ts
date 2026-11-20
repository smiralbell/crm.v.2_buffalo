/**
 * Varias personas por tarea de proyecto.
 *
 * - `assignee` (texto) es lo que se enseña: los nombres separados por comas.
 * - `assignee_user_ids` son los usuarios del CRM a los que va la tarea; es lo
 *   que decide quién la ve. Las tareas antiguas no tienen ids y se casan por nombre.
 *
 * Sin dependencias de servidor: lo usan también los componentes.
 */

export interface AssignableTask {
  assignee: string | null
  assignee_user_ids?: number[] | null
}

export interface TaskViewer {
  id: number
  name: string
  role: string
}

/** Admin y project manager ven todas las tareas de sus proyectos. */
export function seesAllProjectTasks(role: string): boolean {
  return role === 'admin' || role === 'project_manager'
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function splitAssigneeNames(text: string | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of (text ?? '').split(',')) {
    const name = part.trim()
    const key = norm(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

export function joinAssigneeNames(names: string[]): string | null {
  const list = splitAssigneeNames(names.join(','))
  return list.length ? list.join(', ') : null
}

export function assigneeIds(task: AssignableTask): number[] {
  return Array.isArray(task.assignee_user_ids)
    ? task.assignee_user_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : []
}

/**
 * "Calvin" casa con el usuario "Calvin" y con "Calvin Pérez" (y al revés), pero
 * "Calvin Pérez" no casa con "Calvin Gómez".
 */
export function nameMatchesUser(name: string, userName: string): boolean {
  const a = norm(name)
  const b = norm(userName)
  if (!a || !b) return false
  if (a === b) return true
  const aw = a.split(' ')
  const bw = b.split(' ')
  return (aw.length === 1 || bw.length === 1) && aw[0] === bw[0]
}

export function isTaskUnassigned(task: AssignableTask): boolean {
  return assigneeIds(task).length === 0 && splitAssigneeNames(task.assignee).length === 0
}

export function isTaskAssignedTo(task: AssignableTask, user: { id: number; name: string }): boolean {
  const ids = assigneeIds(task)
  if (ids.length > 0) return ids.includes(user.id)
  return splitAssigneeNames(task.assignee).some((n) => nameMatchesUser(n, user.name))
}

/**
 * Qué tareas de un proyecto ve alguien:
 * - admin / project manager: todas;
 * - el resto: las suyas, y las que no tienen a nadie solo si es el único
 *   developer del proyecto (así un proyecto de una sola persona sigue igual).
 */
export function canViewerSeeProjectTask(
  task: AssignableTask,
  viewer: TaskViewer,
  projectDeveloperCount: number
): boolean {
  if (seesAllProjectTasks(viewer.role)) return true
  if (isTaskAssignedTo(task, viewer)) return true
  return isTaskUnassigned(task) && projectDeveloperCount <= 1
}
