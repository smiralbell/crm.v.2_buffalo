import type { TaskPriority } from '@/lib/gestion-proyecto/types'
import type { WorkTask } from '@/lib/tareas/types'

export type DueFilter = 'all' | 'overdue' | 'week' | 'none'

export interface TaskFilterState {
  q: string
  /** 'all' | 'personal' | 'project:<id>' */
  origin: string
  /** 'all' | 'none' (sin asignar) | nombre de la persona */
  person: string
  priority: 'all' | TaskPriority
  due: DueFilter
  hideDone: boolean
}

export const EMPTY_FILTERS: TaskFilterState = {
  q: '',
  origin: 'all',
  person: 'all',
  priority: 'all',
  due: 'all',
  hideDone: false,
}

export function countActiveFilters(f: TaskFilterState): number {
  let n = 0
  if (f.q.trim()) n++
  if (f.origin !== 'all') n++
  if (f.person !== 'all') n++
  if (f.priority !== 'all') n++
  if (f.due !== 'all') n++
  if (f.hideDone) n++
  return n
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function matchesTaskFilters(task: WorkTask, f: TaskFilterState, today = new Date()): boolean {
  if (f.hideDone && task.status === 'done') return false

  if (f.origin === 'personal' && task.source !== 'personal') return false
  if (f.origin.startsWith('project:') && task.project_id !== f.origin.slice('project:'.length)) {
    return false
  }

  if (f.person === 'none' && task.assignee?.trim()) return false
  if (f.person !== 'all' && f.person !== 'none' && norm(task.assignee) !== norm(f.person)) {
    return false
  }

  if (f.priority !== 'all' && task.priority !== f.priority) return false

  if (f.due !== 'all') {
    const due = task.due_date?.slice(0, 10) ?? null
    if (f.due === 'none') {
      if (due) return false
    } else {
      if (!due || task.status === 'done') return false
      const todayKey = dayKey(today)
      if (f.due === 'overdue' && !(due < todayKey)) return false
      if (f.due === 'week') {
        const end = new Date(today)
        end.setDate(end.getDate() + 7)
        if (due < todayKey || due > dayKey(end)) return false
      }
    }
  }

  const q = norm(f.q)
  if (q) {
    const haystack = [
      task.title,
      task.description,
      task.project_name,
      task.assignee,
      ...(task.subtasks ?? []).map((s) => s.title),
    ]
      .map(norm)
      .join(' ')
    if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false
  }

  return true
}

export function applyTaskFilters(tasks: WorkTask[], f: TaskFilterState, today = new Date()): WorkTask[] {
  return tasks.filter((t) => matchesTaskFilters(t, f, today))
}

/**
 * El tablero solo recibe las tareas filtradas y devuelve esa lista cambiada.
 * Esto lo vuelve a juntar con la lista completa: aplica cambios, quita las
 * borradas (estaban visibles y ya no vienen) y añade las nuevas.
 */
export function mergeVisibleTasks<T extends { id: string }>(
  all: T[],
  prevVisible: T[],
  nextVisible: T[]
): T[] {
  const next = new Map(nextVisible.map((t) => [t.id, t]))
  const wasVisible = new Set(prevVisible.map((t) => t.id))
  const out: T[] = []
  for (const t of all) {
    const changed = next.get(t.id)
    if (changed) {
      out.push(changed)
      next.delete(t.id)
    } else if (!wasVisible.has(t.id)) {
      out.push(t)
    }
  }
  next.forEach((t) => out.push(t))
  return out
}
