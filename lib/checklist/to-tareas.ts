import { normalizeSubtasks, type Subtask } from '@/lib/subtasks'

/**
 * Migración del antiguo Checklist a Tareas (reglas, sin base de datos):
 * - columna «santi» → tareas de Santi
 * - columna «sergi» → tareas de Sergi
 * - columna compartida («inbox») → una copia para cada uno
 * - las hechas pasan como terminadas
 */

export type ImportUser = { id: number; name: string; role: string }
export type Socios = { santi: number; sergi: number }

export type ChecklistRow = {
  id: number
  title: string
  done: boolean
  column_key: string
  subtasks: unknown
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * El socio cuyo nombre empieza por `key` («santi» → Santi, Santiago…). Solo
 * cuenta a los admins activos; si hay más de uno que encaje, ninguno.
 */
export function findSocio(users: ImportUser[], key: 'santi' | 'sergi'): number | null {
  const matches = users.filter((u) => u.role === 'admin' && norm(u.name).split(/\s+/)[0]?.startsWith(key))
  return matches.length === 1 ? matches[0].id : null
}

export function ownersForColumn(column: string, socios: Socios): number[] {
  if (column === 'santi') return [socios.santi]
  if (column === 'sergi') return [socios.sergi]
  return socios.santi === socios.sergi ? [socios.santi] : [socios.santi, socios.sergi]
}

const COLUMN_LABEL: Record<string, string> = { santi: 'Santi', sergi: 'Sergi' }

export function taskFromChecklistItem(item: ChecklistRow): {
  title: string
  status: 'done' | 'pending'
  subtasks: Subtask[]
  description: string
} {
  const label = COLUMN_LABEL[item.column_key]
  return {
    title: item.title.trim().slice(0, 500) || 'Tarea del Checklist',
    status: item.done ? 'done' : 'pending',
    subtasks: normalizeSubtasks(item.subtasks),
    description: label
      ? `Pasada desde el Checklist (columna «${label}»).`
      : 'Pasada desde el Checklist (columna compartida: una copia para cada socio).',
  }
}
