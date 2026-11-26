import { prisma } from '@/lib/prisma'
import { getAccessibleProjectIds } from '@/lib/project-access'
import type { AuthUser } from '@/lib/auth'
import { taskEstimatedHours } from '@/lib/developer/task-hours'
import { getHoursReport } from '@/lib/horas/store'

export interface DeveloperDailyHoursPoint {
  date: string
  label: string
  hours: number
  tasks: number
}

export interface DeveloperProjectHoursRow {
  project_id: string
  project_name: string
  hours: number
  tasks_done: number
}

export interface DeveloperWorkCharts {
  daily_hours: DeveloperDailyHoursPoint[]
  hours_by_project: DeveloperProjectHoursRow[]
}

const EMPTY_CHARTS: DeveloperWorkCharts = {
  daily_hours: [],
  hours_by_project: [],
}

const DAY_MS = 24 * 60 * 60 * 1000
const TIMELINE_DAYS = 30

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function buildDailySeries(
  rows: { day: Date | string; hours: number; tasks: number }[]
): DeveloperDailyHoursPoint[] {
  const byDay = new Map<string, { hours: number; tasks: number }>()
  for (const row of rows) {
    const iso =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day).slice(0, 10)
    byDay.set(iso, {
      hours: Number(row.hours) || 0,
      tasks: Number(row.tasks) || 0,
    })
  }

  const points: DeveloperDailyHoursPoint[] = []
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  for (let i = TIMELINE_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS)
    const iso = d.toISOString().slice(0, 10)
    const bucket = byDay.get(iso) ?? { hours: 0, tasks: 0 }
    points.push({
      date: iso,
      label: formatDayLabel(iso),
      hours: Math.round(bucket.hours * 10) / 10,
      tasks: bucket.tasks,
    })
  }

  return points
}

export async function getDeveloperWorkCharts(user: AuthUser): Promise<DeveloperWorkCharts> {
  const projectIds = await getAccessibleProjectIds(user)
  if (projectIds !== null && projectIds.length === 0) return EMPTY_CHARTS

  try {
    let dailyRows: { day: Date; hours: string | number; tasks: string | number }[] = []
    let projectRows: {
      project_id: string
      project_name: string
      hours: string | number
      tasks_done: string | number
    }[] = []

    if (projectIds && projectIds.length > 0) {
      dailyRows = await prisma.$queryRaw<
        { day: Date; hours: string | number; tasks: string | number }[]
      >`
        SELECT
          DATE(updated_at) AS day,
          SUM(
            COALESCE(
              estimated_hours::float,
              CASE priority
                WHEN 'low' THEN 2
                WHEN 'high' THEN 8
                ELSE 4
              END
            )
          )::float AS hours,
          COUNT(*)::int AS tasks
        FROM project_dev_tasks
        WHERE project_id = ANY(${projectIds}::uuid[])
          AND status = 'done'
          AND updated_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(updated_at)
        ORDER BY day ASC
      `

      projectRows = await prisma.$queryRaw<
        {
          project_id: string
          project_name: string
          hours: string | number
          tasks_done: string | number
        }[]
      >`
        SELECT
          t.project_id,
          p.name AS project_name,
          SUM(
            COALESCE(
              t.estimated_hours::float,
              CASE t.priority
                WHEN 'low' THEN 2
                WHEN 'high' THEN 8
                ELSE 4
              END
            )
          )::float AS hours,
          COUNT(*)::int AS tasks_done
        FROM project_dev_tasks t
        INNER JOIN proyectos p ON p.id = t.project_id
        WHERE t.project_id = ANY(${projectIds}::uuid[])
          AND t.status = 'done'
        GROUP BY t.project_id, p.name
        ORDER BY hours DESC
        LIMIT 12
      `
    }

    // Horas reales (registro automático del tiempo en curso), no estimadas
    const now = new Date()
    const report = await getHoursReport(new Date(now.getTime() - TIMELINE_DAYS * DAY_MS), now, { onlyUserId: user.id })
    const me = report.people[0]
    const tasksByDay = new Map(
      dailyRows.map((r) => [r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10), Number(r.tasks)])
    )
    const doneByProject = new Map(projectRows.map((r) => [r.project_id, Number(r.tasks_done)]))
    const days = Array.from(new Set([...Object.keys(me?.by_day ?? {}), ...Array.from(tasksByDay.keys())]))

    return {
      daily_hours: buildDailySeries(
        days.map((day) => ({ day, hours: me?.by_day[day] ?? 0, tasks: tasksByDay.get(day) ?? 0 }))
      ),
      hours_by_project: (me?.by_project ?? [])
        .filter((p) => p.project_id)
        .map((p) => ({
          project_id: p.project_id as string,
          project_name: p.name,
          hours: p.hours,
          tasks_done: doneByProject.get(p.project_id as string) ?? 0,
        })),
    }
  } catch {
    return EMPTY_CHARTS
  }
}

/** Para tests o agregaciones en memoria */
export function sumTaskHours(
  tasks: { priority: string; estimated_hours: number | null }[]
): number {
  return tasks.reduce((sum, t) => sum + taskEstimatedHours(t.priority, t.estimated_hours), 0)
}
