import type { TaskPriority, TaskStatus } from '@/lib/gestion-proyecto/types'
import { newSubtask, subtaskProgress, type Subtask } from '@/lib/subtasks'
import type { WorkTask } from '@/lib/tareas/types'

/**
 * Traducción entre lo que dice el agente de WhatsApp/Telegram (español) y lo que
 * guarda el CRM. Sin base de datos, para poder probarlo.
 */

export const AGENT_STATUSES = ['pendiente', 'en_curso', 'validacion', 'hecha'] as const
export const AGENT_PRIORITIES = ['baja', 'media', 'alta'] as const

const STATUS_FROM: Record<string, TaskStatus> = {
  pendiente: 'pending',
  pending: 'pending',
  por_hacer: 'pending',
  en_curso: 'in_progress',
  'en curso': 'in_progress',
  in_progress: 'in_progress',
  haciendo: 'in_progress',
  validacion: 'buffalo_validation',
  'validación': 'buffalo_validation',
  validacion_buffalo: 'buffalo_validation',
  buffalo_validation: 'buffalo_validation',
  revision: 'buffalo_validation',
  hecha: 'done',
  hecho: 'done',
  terminada: 'done',
  done: 'done',
}

const STATUS_TO: Record<TaskStatus, string> = {
  pending: 'pendiente',
  in_progress: 'en_curso',
  buffalo_validation: 'validacion',
  done: 'hecha',
}

const PRIORITY_FROM: Record<string, TaskPriority> = {
  baja: 'low',
  low: 'low',
  media: 'medium',
  normal: 'medium',
  medium: 'medium',
  alta: 'high',
  urgente: 'high',
  high: 'high',
}

const PRIORITY_TO: Record<TaskPriority, string> = { low: 'baja', medium: 'media', high: 'alta' }

function key(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
}

export function parseAgentStatus(v: unknown): TaskStatus | null {
  return STATUS_FROM[key(v)] ?? null
}

export function parseAgentPriority(v: unknown): TaskPriority | null {
  return PRIORITY_FROM[key(v)] ?? null
}

export function statusLabel(s: TaskStatus): string {
  return STATUS_TO[s] ?? s
}

export function priorityLabel(p: TaskPriority): string {
  return PRIORITY_TO[p] ?? p
}

/** null = quitar la fecha; undefined = no tocarla. Acepta YYYY-MM-DD o ISO. */
export function parseAgentDate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || key(v) === '' || ['ninguna', 'sin fecha', 'quitar'].includes(key(v))) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v).trim())
  if (!m) throw new Error('fecha_fin tiene que ser YYYY-MM-DD')
  const d = new Date(`${m[1]}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[1]) {
    throw new Error(`fecha_fin no es una fecha válida: ${m[1]}`)
  }
  return m[1]
}

/** Subtareas que manda el agente: [{titulo, explicacion?, hecha?}] o textos sueltos. */
export function agentSubtasksInput(v: unknown): { title: string; description?: string; done: boolean }[] {
  if (!Array.isArray(v)) return []
  return v
    .map((item) => {
      if (typeof item === 'string') return { title: item.trim(), done: false }
      const o = (item ?? {}) as Record<string, unknown>
      const title = String(o.titulo ?? o.title ?? '').trim()
      const description = String(o.explicacion ?? o.descripcion ?? o.description ?? '').trim()
      return { title, ...(description ? { description } : {}), done: o.hecha === true || o.done === true }
    })
    .filter((s) => s.title)
}

export function subtasksForAgent(list: Subtask[] | undefined, withText: boolean) {
  return (list ?? []).map((s, i) => ({
    numero: i + 1,
    titulo: s.title,
    hecha: s.done,
    ...(withText && s.description ? { explicacion: s.description } : {}),
  }))
}

/** Una línea por tarea para listados (sin descripción completa). */
export function taskSummaryForAgent(t: WorkTask) {
  const { done, total } = subtaskProgress(t.subtasks)
  return {
    id: t.id,
    titulo: t.title,
    tipo: t.source === 'personal' ? 'suelta' : 'proyecto',
    ...(t.source === 'personal' ? { persona: t.assignee } : { proyecto: t.project_name, asignado: t.assignee }),
    estado: statusLabel(t.status),
    prioridad: priorityLabel(t.priority),
    ...(t.due_date ? { fecha_fin: t.due_date } : {}),
    ...(total ? { subtareas: `${done}/${total}` } : {}),
    ...(t.source === 'personal' && t.created_by_name ? { puesta_por: t.created_by_name } : {}),
  }
}

/** Ficha completa de una tarea, con descripción y subtareas numeradas. */
export function taskDetailForAgent(t: WorkTask, baseUrl = '') {
  return {
    ...taskSummaryForAgent(t),
    descripcion: t.description ?? '',
    horas_estimadas: t.estimated_hours,
    subtareas: subtasksForAgent(t.subtasks, true),
    adjuntos: (t.attachments ?? []).map((a) => a.file_name),
    enlace:
      t.source === 'personal'
        ? `${baseUrl}/usuarios/${t.owner_user_id}/tareas`
        : `${baseUrl}/gestion-proyecto/proyectos/${t.project_id}?tab=tareas`,
  }
}

function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Aplica una acción sobre la lista de subtareas (lo usan el agente de los socios
 * y el del equipo). numero empieza en 1.
 */
export function applySubtaskAction(
  list: Subtask[],
  args: Record<string, unknown>
): { ok: true; next: Subtask[] } | { ok: false; error: string } {
  const accion = plain(String(args.accion ?? ''))
  const idx = Number(args.numero) - 1
  if (['editar', 'marcar', 'desmarcar', 'quitar'].includes(accion) && !(idx >= 0 && idx < list.length)) {
    return { ok: false, error: list.length ? `numero tiene que estar entre 1 y ${list.length}` : 'Esta tarea no tiene subtareas' }
  }
  if (accion === 'anadir') {
    const title = String(args.titulo ?? '').trim()
    if (!title) return { ok: false, error: 'Falta el título de la subtarea' }
    const s = newSubtask(title)
    const explicacion = String(args.explicacion ?? '').trim()
    return { ok: true, next: [...list, explicacion ? { ...s, description: explicacion } : s] }
  }
  if (accion === 'editar') {
    const cur = list[idx]
    const title = args.titulo !== undefined ? String(args.titulo).trim() || cur.title : cur.title
    const explicacion = args.explicacion !== undefined ? String(args.explicacion).trim() : cur.description ?? ''
    const updated: Subtask = { ...cur, title }
    if (explicacion) updated.description = explicacion
    else delete updated.description
    return { ok: true, next: list.map((s, i) => (i === idx ? updated : s)) }
  }
  if (accion === 'marcar' || accion === 'desmarcar') {
    return { ok: true, next: list.map((s, i) => (i === idx ? { ...s, done: accion === 'marcar' } : s)) }
  }
  if (accion === 'quitar') return { ok: true, next: list.filter((_, i) => i !== idx) }
  if (accion === 'reemplazar') {
    return {
      ok: true,
      next: agentSubtasksInput(args.subtareas).map((s) => ({
        ...newSubtask(s.title),
        done: s.done,
        ...(s.description ? { description: s.description } : {}),
      })),
    }
  }
  return { ok: false, error: 'accion no válida: anadir, editar, marcar, desmarcar, quitar o reemplazar' }
}
