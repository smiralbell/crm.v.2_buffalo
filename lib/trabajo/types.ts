/** Una cosa hecha un día concreto (módulo Trabajo diario). */
export interface WorkEntry {
  id: string
  user_id: number
  user_name: string
  /** YYYY-MM-DD */
  work_date: string
  title: string
  detail: string | null
  project_id: string | null
  project_name: string | null
  hours: number | null
  /** Mensaje original del que salió (audio transcrito o texto), si lo hay */
  report_id: string | null
  /** manual = desde el CRM; whatsapp = desde el agente */
  source: 'manual' | 'whatsapp'
  created_at: string
  updated_at: string
}

/** Lo que la persona contó tal cual (para poder volver a leerlo). */
export interface WorkReport {
  id: string
  user_id: number
  raw_text: string
  source: 'manual' | 'whatsapp'
  created_by_name: string | null
  created_at: string
}

/** Entrada ya validada, lista para guardar. */
export interface WorkItemInput {
  work_date: string
  title: string
  detail: string | null
  project_id: string | null
  hours: number | null
}

export interface TrabajoResponse {
  entries: WorkEntry[]
  reports: WorkReport[]
  /** Proyectos de la persona (para elegir en el formulario) */
  projects: { id: string; name: string }[]
  me: { id: number; name: string; role: string }
  scope_user: { id: number; name: string; role: string } | null
  range: { from: string; to: string }
}
