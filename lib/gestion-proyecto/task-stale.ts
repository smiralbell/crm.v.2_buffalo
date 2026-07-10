import type { ProjectTask, TaskStatus } from './types'

export const STALE_DAYS = 10
export const STALE_EXTENSION_DAYS = 10

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  buffalo_validation: 'Validación por Buffalo',
  done: 'Hecho',
}

export const TASK_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'pending', label: 'Pendiente' },
  { id: 'in_progress', label: 'En curso' },
  { id: 'buffalo_validation', label: 'Validación por Buffalo' },
  { id: 'done', label: 'Hecho' },
]

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function daysInCurrentColumn(task: Pick<ProjectTask, 'status_changed_at'>): number {
  const changed = new Date(task.status_changed_at)
  const now = new Date()
  return Math.max(0, Math.round((startOfDay(now).getTime() - startOfDay(changed).getTime()) / 86400000))
}

export function isStaleTask(
  task: Pick<ProjectTask, 'status' | 'status_changed_at' | 'stale_extension_until'>
): boolean {
  if (task.status === 'done') return false
  const now = new Date()
  if (task.stale_extension_until && now < new Date(task.stale_extension_until)) return false
  return daysInCurrentColumn(task) >= STALE_DAYS
}

const ASSIGNEE_FALLBACK_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#0ea5e9',
  '#14b8a6',
  '#f59e0b',
  '#ec4899',
  '#84cc16',
  '#f97316',
]

export function buildAssigneeColorMap(
  tasks: Pick<ProjectTask, 'assignee'>[],
  teamMembers: { name: string; color: string | null }[]
): Map<string, string> {
  const memberColor = new Map(teamMembers.map((m) => [m.name.trim().toLowerCase(), m.color]))
  const assignees = Array.from(
    new Set(tasks.map((t) => t.assignee?.trim()).filter((n): n is string => Boolean(n)))
  ).sort((a, b) => a.localeCompare(b, 'es'))

  const map = new Map<string, string>()
  let fallbackIdx = 0
  for (const name of assignees) {
    const fromMember = memberColor.get(name.toLowerCase())
    map.set(
      name,
      fromMember && /^#[0-9a-fA-F]{6}$/.test(fromMember)
        ? fromMember
        : ASSIGNEE_FALLBACK_COLORS[fallbackIdx++ % ASSIGNEE_FALLBACK_COLORS.length]
    )
  }
  return map
}

export function serializeTaskRow<T extends Record<string, unknown>>(row: T) {
  const statusChanged = row.status_changed_at
  const extensionUntil = row.stale_extension_until
  return {
    ...row,
    status_changed_at:
      statusChanged instanceof Date
        ? statusChanged.toISOString()
        : typeof statusChanged === 'string'
          ? statusChanged
          : new Date().toISOString(),
    stale_extension_until:
      extensionUntil instanceof Date
        ? extensionUntil.toISOString()
        : extensionUntil
          ? String(extensionUntil)
          : null,
    stale_notice_active: Boolean(row.stale_notice_active),
  }
}
