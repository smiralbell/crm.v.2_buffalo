import { CHECKLIST_COLUMNS, type ChecklistColumnId } from '@/lib/checklist/types'
import { normalizeSubtasks, type Subtask } from '@/lib/subtasks'

/**
 * Pasar el Checklist a Tareas: a quién va cada columna y qué tarea sale de cada
 * cosa. Sin base de datos.
 */

export type ImportUser = { id: number; name: string; role: string }

/** Columna → usuario que recibe sus tareas (null = no se pasa). */
export type ImportMap = Record<ChecklistColumnId, number | null>

export type ImportableItem = {
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
 * «Santi» → el usuario cuyo nombre empieza por «santi» (Santi, Santiago…);
 * «Sergi» igual. Si hay varios, solo se elige si uno es admin. La columna
 * compartida no se sugiere: la elige quien importa.
 */
export function suggestOwners(users: ImportUser[]): ImportMap {
  const pick = (key: string): number | null => {
    const matches = users.filter((u) => norm(u.name).split(/\s+/)[0]?.startsWith(key))
    if (matches.length === 1) return matches[0].id
    const admins = matches.filter((u) => u.role === 'admin')
    return admins.length === 1 ? admins[0].id : null
  }
  return { inbox: null, santi: pick('santi'), sergi: pick('sergi') }
}

export function taskFromChecklistItem(item: ImportableItem): {
  title: string
  status: 'done' | 'pending'
  subtasks: Subtask[]
  description: string
} {
  const column = CHECKLIST_COLUMNS.find((c) => c.id === item.column_key)
  return {
    title: item.title.trim().slice(0, 500) || 'Tarea del Checklist',
    status: item.done ? 'done' : 'pending',
    subtasks: normalizeSubtasks(item.subtasks),
    description: `Pasada desde el Checklist (columna «${column?.label ?? item.column_key}»).`,
  }
}

export type ImportPlan = {
  create: { item: ImportableItem; ownerId: number }[]
  skippedDone: number
  skippedUnassigned: number
}

/** Qué se crea: lo de columnas con dueño, y lo hecho solo si se pide. */
export function planChecklistImport(items: ImportableItem[], map: ImportMap, includeDone: boolean): ImportPlan {
  const plan: ImportPlan = { create: [], skippedDone: 0, skippedUnassigned: 0 }
  for (const item of items) {
    const ownerId = map[item.column_key as ChecklistColumnId] ?? null
    if (!ownerId) {
      plan.skippedUnassigned += 1
      continue
    }
    if (item.done && !includeDone) {
      plan.skippedDone += 1
      continue
    }
    plan.create.push({ item, ownerId })
  }
  return plan
}
