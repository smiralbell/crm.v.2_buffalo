import type {
  ProjectDashboardAssigneeRow,
  ProjectDashboardData,
  ProjectDashboardHours,
  ProjectDashboardPriorityRow,
  ProjectDashboardTaskCounts,
  ProjectDashboardTimeline,
  ProjectDashboardTimelinePoint,
  TaskPriority,
  TaskStatus,
} from './types'

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

const DEFAULT_HOURS: Record<TaskPriority, number> = {
  low: 2,
  medium: 4,
  high: 8,
}

export interface DashboardTaskInput {
  id: string
  status: TaskStatus
  priority: TaskPriority
  assignee: string | null
  estimated_hours: number | null
  created_at: string
  updated_at: string
}

export interface DashboardProjectInput {
  id: string
  name: string
  status: string
  service_type: string
  config_ref: string | null
  created_at: string
  launched_at: string | null
  dev_target_end_date: string | null
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

export function estimateTaskHours(task: Pick<DashboardTaskInput, 'priority' | 'estimated_hours'>): number {
  if (task.estimated_hours != null && task.estimated_hours > 0) return Number(task.estimated_hours)
  return DEFAULT_HOURS[task.priority]
}

function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function getWeekStart(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return startOfDay(monday)
}

function buildTimeline(
  project: DashboardProjectInput,
  tasks: DashboardTaskInput[]
): ProjectDashboardTimeline {
  const start = project.created_at ? new Date(project.created_at) : null
  const targetEnd = project.dev_target_end_date
    ? new Date(project.dev_target_end_date)
    : project.launched_at
      ? new Date(project.launched_at)
      : null
  const now = new Date()

  const daysElapsed = start ? daysBetween(start, now) : 0
  const daysTotal = start && targetEnd ? Math.max(1, daysBetween(start, targetEnd)) : null
  const daysRemaining =
    targetEnd && startOfDay(targetEnd) >= startOfDay(now)
      ? daysBetween(now, targetEnd)
      : targetEnd
        ? 0
        : null

  let timeProgressPct: number | null = null
  if (daysTotal != null && daysTotal > 0) {
    timeProgressPct = Math.min(100, Math.round((daysElapsed / daysTotal) * 100))
  }

  return {
    start_date: start?.toISOString() ?? null,
    end_date: targetEnd?.toISOString() ?? null,
    launched_at: project.launched_at,
    dev_target_end_date: project.dev_target_end_date,
    days_elapsed: daysElapsed,
    days_total: daysTotal,
    days_remaining: daysRemaining,
    time_progress_pct: timeProgressPct,
  }
}

function buildTaskCounts(tasks: DashboardTaskInput[]): ProjectDashboardTaskCounts {
  const pending = tasks.filter((t) => t.status === 'pending').length
  const in_progress = tasks.filter((t) => t.status === 'in_progress').length
  const done = tasks.filter((t) => t.status === 'done').length
  const total = tasks.length
  const completion_pct = total > 0 ? Math.round((done / total) * 100) : 0
  return { total, pending, in_progress, done, completion_pct }
}

function buildHours(tasks: DashboardTaskInput[]): ProjectDashboardHours {
  let total = 0
  let done = 0
  let pending = 0
  let in_progress = 0
  for (const t of tasks) {
    const h = estimateTaskHours(t)
    total += h
    if (t.status === 'done') done += h
    else if (t.status === 'in_progress') in_progress += h
    else pending += h
  }
  return {
    total_estimated: Math.round(total * 10) / 10,
    done_estimated: Math.round(done * 10) / 10,
    pending_estimated: Math.round(pending * 10) / 10,
    in_progress_estimated: Math.round(in_progress * 10) / 10,
  }
}

function buildAssigneeRows(tasks: DashboardTaskInput[]): ProjectDashboardAssigneeRow[] {
  const map = new Map<string, ProjectDashboardAssigneeRow>()
  for (const t of tasks) {
    const key = (t.assignee?.trim() || 'Sin asignar')
    const row = map.get(key) || {
      assignee: key,
      total: 0,
      pending: 0,
      in_progress: 0,
      done: 0,
      hours: 0,
    }
    row.total += 1
    row.hours += estimateTaskHours(t)
    if (t.status === 'pending') row.pending += 1
    else if (t.status === 'in_progress') row.in_progress += 1
    else row.done += 1
    map.set(key, row)
  }
  return Array.from(map.values())
    .map((r) => ({ ...r, hours: Math.round(r.hours * 10) / 10 }))
    .sort((a, b) => b.total - a.total)
}

function buildPriorityRows(tasks: DashboardTaskInput[]): ProjectDashboardPriorityRow[] {
  const order: TaskPriority[] = ['high', 'medium', 'low']
  return order.map((priority) => ({
    priority,
    label: PRIORITY_LABELS[priority],
    count: tasks.filter((t) => t.priority === priority).length,
  }))
}

function buildActivityTimeline(
  project: DashboardProjectInput,
  tasks: DashboardTaskInput[]
): ProjectDashboardTimelinePoint[] {
  if (tasks.length === 0) return []

  const start = project.created_at ? new Date(project.created_at) : new Date(tasks[0].created_at)
  const end = new Date()
  const latestTask = tasks.reduce((max, t) => {
    const u = new Date(t.updated_at).getTime()
    return u > max ? u : max
  }, 0)
  if (latestTask > end.getTime()) end.setTime(latestTask)

  const spanDays = daysBetween(start, end)
  const useWeekly = spanDays > 21

  const points: ProjectDashboardTimelinePoint[] = []
  let cursor = useWeekly ? getWeekStart(start) : startOfDay(start)
  const limit = startOfDay(end)

  while (cursor <= limit) {
    const bucketEnd = new Date(cursor)
    if (useWeekly) bucketEnd.setDate(bucketEnd.getDate() + 6)
    else bucketEnd.setHours(23, 59, 59, 999)

    const created_cumulative = tasks.filter((t) => new Date(t.created_at) <= bucketEnd).length
    const completed_cumulative = tasks.filter(
      (t) => t.status === 'done' && new Date(t.updated_at) <= bucketEnd
    ).length

    points.push({
      label: formatWeekLabel(cursor),
      date: cursor.toISOString(),
      created_cumulative,
      completed_cumulative,
      open: created_cumulative - completed_cumulative,
    })

    if (useWeekly) cursor.setDate(cursor.getDate() + 7)
    else cursor.setDate(cursor.getDate() + 1)
  }

  return points
}

function buildVelocity(tasks: DashboardTaskInput[]) {
  const now = Date.now()
  const d7 = now - 7 * 24 * 60 * 60 * 1000
  const d30 = now - 30 * 24 * 60 * 60 * 1000

  const doneTasks = tasks.filter((t) => t.status === 'done')
  const tasks_done_last_7d = doneTasks.filter((t) => new Date(t.updated_at).getTime() >= d7).length
  const tasks_done_last_30d = doneTasks.filter((t) => new Date(t.updated_at).getTime() >= d30).length

  let avg_days_to_complete: number | null = null
  if (doneTasks.length > 0) {
    const sum = doneTasks.reduce((acc, t) => {
      const created = new Date(t.created_at).getTime()
      const doneAt = new Date(t.updated_at).getTime()
      return acc + Math.max(0, (doneAt - created) / (1000 * 60 * 60 * 24))
    }, 0)
    avg_days_to_complete = Math.round((sum / doneTasks.length) * 10) / 10
  }

  return { tasks_done_last_7d, tasks_done_last_30d, avg_days_to_complete }
}

export function buildProjectDashboard(
  project: DashboardProjectInput,
  tasks: DashboardTaskInput[]
): ProjectDashboardData {
  return {
    proyecto: {
      id: project.id,
      name: project.name,
      status: project.status,
      service_type: project.service_type,
      config_ref: project.config_ref,
    },
    timeline: buildTimeline(project, tasks),
    task_counts: buildTaskCounts(tasks),
    hours: buildHours(tasks),
    by_assignee: buildAssigneeRows(tasks),
    by_priority: buildPriorityRows(tasks),
    activity_timeline: buildActivityTimeline(project, tasks),
    velocity: buildVelocity(tasks),
  }
}

export function formatDashboardDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
