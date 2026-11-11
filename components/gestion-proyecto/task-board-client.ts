import type { ProjectTask, ProjectTaskAttachment } from '@/lib/gestion-proyecto/types'

/**
 * Cómo guarda el tablero sus tareas. El tablero de un proyecto usa la API del
 * proyecto; el módulo Tareas mezcla tareas sueltas y de varios proyectos.
 */
export interface TaskBoardClient {
  /** `target` = dónde se crea (en un proyecto se ignora) */
  create(target: string, body: Record<string, unknown>): Promise<ProjectTask>
  update(task: ProjectTask, body: Record<string, unknown>): Promise<ProjectTask>
  remove(task: ProjectTask): Promise<void>
  uploadAttachments(task: ProjectTask, files: File[]): Promise<ProjectTaskAttachment[]>
  attachmentUrl(task: ProjectTask, attachmentId: string): string
}

/** Dónde se puede crear una tarea (el selector solo sale si hay más de una opción). */
export interface TaskCreateTarget {
  id: string
  label: string
  group?: string
  /** Permite elegir persona asignada (las de proyecto) */
  assignable?: boolean
  /** Permite adjuntar archivos (las de proyecto) */
  attachments?: boolean
}

export async function requestJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || fallback)
  return data as T
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Cliente del tablero de un proyecto (zona de trabajo). */
export function projectTaskClient(projectId: string): TaskBoardClient {
  const base = `/api/gestion-proyecto/proyectos/${projectId}/tasks`
  return {
    create: (_target, body) => requestJson(base, jsonInit('POST', body), 'No se pudo crear la tarea'),
    update: (task, body) =>
      requestJson(`${base}/${task.id}`, jsonInit('PATCH', body), 'No se pudo actualizar'),
    remove: async (task) => {
      await requestJson(`${base}/${task.id}`, { method: 'DELETE' }, 'No se pudo eliminar')
    },
    uploadAttachments: async (task, files) => {
      if (files.length === 0) return []
      const formData = new FormData()
      for (const file of files) formData.append('file', file)
      const data = await requestJson<{ attachments?: ProjectTaskAttachment[] }>(
        `${base}/${task.id}/attachments/upload`,
        { method: 'POST', body: formData },
        'No se pudieron subir los archivos'
      )
      return data.attachments || []
    },
    attachmentUrl: (task, attId) => `${base}/${task.id}/attachments/${attId}/file`,
  }
}
