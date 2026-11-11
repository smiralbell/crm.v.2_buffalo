import type { ProjectTask } from '@/lib/gestion-proyecto/types'

/** De dónde viene una tarea del módulo Tareas. */
export type WorkTaskSource = 'personal' | 'project'

/**
 * Tarea del módulo Tareas: mismas columnas que una tarea de proyecto,
 * más de dónde viene. Las sueltas tienen `project_id` vacío.
 */
export interface WorkTask extends ProjectTask {
  source: WorkTaskSource
  project_name: string | null
  /** Usuario al que pertenece una tarea suelta */
  owner_user_id: number | null
  /** Quién creó la tarea suelta (para "Asignada por …") */
  created_by_id: number | null
  created_by_name: string | null
}

export interface WorkPerson {
  id: number
  name: string
  role: string
}

export interface WorkProject {
  id: string
  name: string
}

export interface TareasResponse {
  tasks: WorkTask[]
  projects: WorkProject[]
  /** Solo admin: a quién se le pueden poner tareas sueltas */
  people: WorkPerson[]
  me: { id: number; name: string; role: string }
  /** Usuario cuyas tareas se están viendo (ficha de usuario o el propio) */
  scope_user: WorkPerson | null
}
