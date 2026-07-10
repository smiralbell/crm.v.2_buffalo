export type TaskStatus = 'pending' | 'in_progress' | 'buffalo_validation' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'
export type DocType = 'link' | 'file'

export interface ProjectListRow {
  kind?: 'project' | 'assignment'
  id: string
  name: string
  status: string
  service_type: string
  config_ref: string | null
  lead_id: number | null
  updated_at: string
  contact: {
    id: number
    nombre: string | null
    email: string | null
    empresa: string | null
  } | null
  task_counts: {
    pending: number
    in_progress: number
    buffalo_validation: number
    done: number
  }
  developers: { id: number; name: string; email: string }[]
  assignment_summary?: string | null
  due_date?: string | null
}

export interface ProjectOnboarding {
  project_id: string
  summary: string
  client_context: string
  scope_text: string
  stack_text: string
  deliverables: string
  contacts: string
  internal_notes: string
  updated_at: string
}

export interface ProjectDoc {
  id: string
  project_id: string
  title: string
  doc_type: DocType
  url: string | null
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  created_at: string
}

export interface ProjectTaskAttachment {
  id: string
  task_id: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  created_at: string
}

export interface ProjectTask {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee: string | null
  estimated_hours: number | null
  position: number
  status_changed_at: string
  stale_extension_until: string | null
  stale_notice_active: boolean
  created_at: string
  updated_at: string
  attachments?: ProjectTaskAttachment[]
}

export interface ProjectDashboardTimeline {
  start_date: string | null
  end_date: string | null
  launched_at: string | null
  dev_target_end_date: string | null
  days_elapsed: number
  days_total: number | null
  days_remaining: number | null
  time_progress_pct: number | null
}

export interface ProjectDashboardTaskCounts {
  total: number
  pending: number
  in_progress: number
  buffalo_validation: number
  done: number
  completion_pct: number
}

export interface ProjectDashboardHours {
  total_estimated: number
  done_estimated: number
  pending_estimated: number
  in_progress_estimated: number
}

export interface ProjectDashboardAssigneeRow {
  assignee: string
  total: number
  pending: number
  in_progress: number
  buffalo_validation: number
  done: number
  hours: number
}

export interface ProjectDashboardTimelinePoint {
  label: string
  date: string
  created_cumulative: number
  completed_cumulative: number
  open: number
}

export interface ProjectDashboardPriorityRow {
  priority: TaskPriority
  label: string
  count: number
}

export interface ProjectDashboardData {
  proyecto: {
    id: string
    name: string
    status: string
    service_type: string
    config_ref: string | null
  }
  timeline: ProjectDashboardTimeline
  task_counts: ProjectDashboardTaskCounts
  hours: ProjectDashboardHours
  by_assignee: ProjectDashboardAssigneeRow[]
  by_priority: ProjectDashboardPriorityRow[]
  activity_timeline: ProjectDashboardTimelinePoint[]
  velocity: {
    tasks_done_last_7d: number
    tasks_done_last_30d: number
    avg_days_to_complete: number | null
  }
}

export interface ProjectAiSummary {
  resumen_ejecutivo: string
  salud_proyecto_0_100: number
  estado_actual: string
  fortalezas: string[]
  riesgos: string[]
  cuellos_de_botella: string[]
  mejoras_sugeridas: string[]
  acciones_prioritarias: string[]
  predicciones: string[]
  por_persona: { persona: string; situacion: string }[]
}
