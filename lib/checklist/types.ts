export const CHECKLIST_COLUMNS = [
  { id: 'inbox', label: 'Checklist', hint: 'Apunta aquí todo lo pendiente' },
  { id: 'santi', label: 'Santi', hint: 'Tareas de Santi' },
  { id: 'sergi', label: 'Sergi', hint: 'Tareas de Sergi' },
] as const

export type ChecklistColumnId = (typeof CHECKLIST_COLUMNS)[number]['id']

export const CHECKLIST_REMIND_OPTIONS = [
  { days: 0, label: 'No recordar' },
  { days: 1, label: 'Cada día' },
  { days: 2, label: 'Cada 2 días' },
  { days: 3, label: 'Cada 3 días' },
  { days: 7, label: 'Cada semana' },
  { days: 15, label: 'Cada 15 días' },
  { days: 30, label: 'Cada mes' },
] as const

export interface ChecklistItem {
  id: number
  title: string
  done: boolean
  column_key: ChecklistColumnId
  position: number
  remind_every_days: number
  last_reminded_at: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export function checklistRemindLabel(days: number): string {
  return CHECKLIST_REMIND_OPTIONS.find((o) => o.days === days)?.label || `Cada ${days} días`
}

export function isChecklistColumnId(v: unknown): v is ChecklistColumnId {
  return v === 'inbox' || v === 'santi' || v === 'sergi'
}
