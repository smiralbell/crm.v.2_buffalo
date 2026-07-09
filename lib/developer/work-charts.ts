import { prisma } from '@/lib/prisma'
import { getAccessibleProjectIds } from '@/lib/project-access'
import type { AuthUser } from '@/lib/auth'
import { taskEstimatedHours } from '@/lib/developer/task-hours'

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

    return {
      daily_hours: buildDailySeries(
        dailyRows.map((r) => ({
          day: r.day,
          hours: Number(r.hours),
          tasks: Number(r.tasks),
        }))
      ),
      hours_by_project: projectRows.map((r) => ({
        project_id: r.project_id,
        project_name: r.project_name,
        hours: Math.round(Number(r.hours) * 10) / 10,
        tasks_done: Number(r.tasks_done),
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
