import type { WorkPerson, WorkTask } from '@/lib/tareas/types'

/**
 * A quién pertenece cada tarea, para el filtro de personas del panel de admin:
 * - `u:<id>`   un usuario del CRM (dueño de la tarea suelta, o responsable de
 *              la de proyecto si su nombre coincide con el de un usuario)
 * - `n:<nombre>` responsable de una tarea de proyecto que no es usuario del CRM
 * - `none`     tarea de proyecto sin responsable
 */
export type PersonKey = string

export const NO_PERSON: PersonKey = 'none'

export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function userKey(id: number): PersonKey {
  return `u:${id}`
}

/** Nombre normalizado → usuario, para casar responsables de proyecto con usuarios. */
export function buildNameIndex(people: WorkPerson[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const p of people) {
    const key = normName(p.name)
    if (key && !index.has(key)) index.set(key, p.id)
  }
  return index
}

export function taskPersonKey(task: WorkTask, nameIndex: Map<string, number>): PersonKey {
  if (task.source === 'personal' && task.owner_user_id != null) return userKey(task.owner_user_id)
  const name = normName(task.assignee)
  if (!name) return NO_PERSON
  const id = nameIndex.get(name)
  return id != null ? userKey(id) : `n:${name}`
}

export interface PersonOption {
  key: PersonKey
  label: string
  /** Tareas sin terminar */
  open: number
  total: number
  /** Usuario del CRM (para asignarle tareas) */
  userId: number | null
  role: string | null
}

/**
 * Opciones del filtro: todos los usuarios (aunque no tengan tareas), luego los
 * responsables de proyecto que no son usuarios y, al final, "Sin asignar".
 */
export function buildPersonOptions(
  tasks: WorkTask[],
  people: WorkPerson[],
  nameIndex: Map<string, number>
): PersonOption[] {
  const byKey = new Map<PersonKey, PersonOption>()
  for (const p of people) {
    byKey.set(userKey(p.id), { key: userKey(p.id), label: p.name, open: 0, total: 0, userId: p.id, role: p.role })
  }
  for (const t of tasks) {
    const key = taskPersonKey(t, nameIndex)
    let opt = byKey.get(key)
    if (!opt) {
      opt =
        key === NO_PERSON
          ? { key, label: 'Sin asignar', open: 0, total: 0, userId: null, role: null }
          : key.startsWith('u:')
            ? { key, label: t.assignee || 'Usuario', open: 0, total: 0, userId: Number(key.slice(2)), role: null }
            : { key, label: (t.assignee || '').trim(), open: 0, total: 0, userId: null, role: null }
      byKey.set(key, opt)
    }
    opt.total += 1
    if (t.status !== 'done') opt.open += 1
  }
  const all = Array.from(byKey.values())
  const rank = (o: PersonOption) => (o.key === NO_PERSON ? 2 : o.userId != null ? 0 : 1)
  return all.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'es'))
}

/** Sin nadie marcado = se ve a todos. */
export function filterByPeople(
  tasks: WorkTask[],
  selected: PersonKey[],
  nameIndex: Map<string, number>
): WorkTask[] {
  if (selected.length === 0) return tasks
  const set = new Set(selected)
  return tasks.filter((t) => set.has(taskPersonKey(t, nameIndex)))
}
