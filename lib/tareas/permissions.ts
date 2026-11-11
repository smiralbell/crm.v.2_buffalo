import type { WorkTask } from '@/lib/tareas/types'

interface Viewer {
  id: number
  role: string
}

/**
 * Una tarea suelta la puede borrar admin o el propio usuario si se la creó él.
 * Las que pone admin no se pueden borrar desde la cuenta del developer: se mueven a Hecho.
 */
export function canDeletePersonalTask(
  viewer: Viewer,
  task: Pick<WorkTask, 'owner_user_id' | 'created_by_id'>
): boolean {
  if (viewer.role === 'admin') return true
  return task.owner_user_id === viewer.id && task.created_by_id === viewer.id
}

/** Las de proyecto siguen las reglas del proyecto (quien tiene acceso puede borrarlas). */
export function canDeleteWorkTask(viewer: Viewer, task: WorkTask): boolean {
  if (task.source === 'project') return true
  return canDeletePersonalTask(viewer, task)
}
