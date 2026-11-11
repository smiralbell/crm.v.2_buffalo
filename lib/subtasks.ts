/**
 * Subtareas compartidas por el checklist y las tareas de proyecto.
 * Se guardan como un array JSON dentro de la tarea padre (columna `subtasks`),
 * así nunca aparecen como tarjetas sueltas en el tablero.
 */
export interface Subtask {
  id: string
  title: string
  done: boolean
}

export const MAX_SUBTASKS = 50
export const MAX_SUBTASK_TITLE = 300

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function newSubtask(title: string): Subtask {
  return { id: randomId(), title: title.trim().slice(0, MAX_SUBTASK_TITLE), done: false }
}

/** Limpia lo que venga de la base de datos o del cliente. Lo inválido se descarta. */
export function normalizeSubtasks(raw: unknown): Subtask[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const out: Subtask[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const title = typeof e.title === 'string' ? e.title.trim().slice(0, MAX_SUBTASK_TITLE) : ''
    if (!title) continue
    let id = typeof e.id === 'string' && e.id.trim() ? e.id.trim().slice(0, 40) : randomId()
    if (seen.has(id)) id = randomId()
    seen.add(id)
    out.push({ id, title, done: e.done === true })
    if (out.length >= MAX_SUBTASKS) break
  }
  return out
}

export function subtaskProgress(list: Subtask[] | null | undefined): { done: number; total: number } {
  const items = list || []
  return { done: items.filter((s) => s.done).length, total: items.length }
}
