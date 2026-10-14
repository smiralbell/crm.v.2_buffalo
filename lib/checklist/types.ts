export const CHECKLIST_COLUMNS = [
  { id: 'inbox', label: 'Checklist', hint: 'Apunta aquí todo lo pendiente' },
  { id: 'santi', label: 'Santi', hint: 'Tareas de Santi' },
  { id: 'sergi', label: 'Sergi', hint: 'Tareas de Sergi' },
] as const

export type ChecklistColumnId = (typeof CHECKLIST_COLUMNS)[number]['id']

export { WEEKDAY_OPTIONS, checklistRemindLabel } from '@/lib/checklist/remind'
export type { ChecklistRemindMode } from '@/lib/checklist/remind'

export interface ChecklistItem {
  id: number
  title: string
  done: boolean
  column_key: ChecklistColumnId
  position: number
  remind_every_days: number
  remind_weekday: number | null
  remind_time: string | null
  last_reminded_at: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export function isChecklistColumnId(v: unknown): v is ChecklistColumnId {
  return v === 'inbox' || v === 'santi' || v === 'sergi'
}
