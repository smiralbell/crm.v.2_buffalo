import { prisma } from '@/lib/prisma'
import {
  applyConfirmed,
  computeMinutes,
  DEFAULT_SCHEDULE,
  localDay,
  taskTotal,
  toHours,
  workdayMinutes,
  type HoursTable,
  type Segment,
} from '@/lib/horas/formula'

/**
 * Datos de horas: tramos en curso (los apunta el trigger) + horas confirmadas,
 * pasados por la fórmula de lib/horas/formula.ts.
 */

type SegmentRow = {
  task_id: string
  source: string
  project_id: string | null
  user_id: number | null
  person_name: string | null
  started_at: Date
  ended_at: Date | null
}

const personKey = (userId: number | null, name: string | null) => (userId != null ? `u:${userId}` : `n:${name?.trim() || 'Sin asignar'}`)

/** Cuánto hacia atrás se mira para repartir bien tareas largas que caen en el periodo. */
const MAX_LOOKBACK_DAYS = 120

async function segmentsOverlapping(from: Date, to: Date): Promise<SegmentRow[]> {
  return prisma.$queryRawUnsafe<SegmentRow[]>(
    `SELECT task_id::text, source, project_id::text, user_id, person_name, started_at, ended_at
       FROM task_time_segments
      WHERE started_at < $2 AND (ended_at IS NULL OR ended_at > $1)`,
    from,
    to
  )
}

function toSegments(rows: SegmentRow[]): Segment[] {
  return rows.map((r) => ({
    person: personKey(r.user_id, r.person_name),
    task: r.task_id,
    start: new Date(r.started_at),
    end: r.ended_at ? new Date(r.ended_at) : null,
  }))
}

type Confirmed = { task_id: string; user_id: number; hours: number; confirmed_at: Date; computed_hours: number | null }

async function confirmedFor(taskIds: string[]): Promise<Confirmed[]> {
  if (!taskIds.length) return []
  const rows = await prisma.$queryRawUnsafe<{ task_id: string; user_id: number; hours: unknown; confirmed_at: Date; computed_hours: unknown }[]>(
    `SELECT task_id::text, user_id, hours, confirmed_at, computed_hours FROM task_hours_confirmed WHERE task_id = ANY($1::uuid[])`,
    taskIds
  )
  return rows.map((r) => ({
    ...r,
    hours: Number(r.hours),
    computed_hours: r.computed_hours == null ? null : Number(r.computed_hours),
  }))
}

/** Tabla de minutos con todo lo necesario para que el reparto y lo confirmado salgan bien. */
async function buildTable(from: Date, to: Date): Promise<{ table: HoursTable; taskSource: Map<string, { source: string; project_id: string | null }> }> {
  const inRange = await segmentsOverlapping(from, to)
  const confirmedInRange = await prisma.$queryRawUnsafe<{ task_id: string; source: string }[]>(
    `SELECT task_id::text, source FROM task_hours_confirmed WHERE confirmed_at >= $1 AND confirmed_at < $2`,
    from,
    to
  )
  const taskIds = Array.from(new Set([...inRange.map((r) => r.task_id), ...confirmedInRange.map((r) => r.task_id)]))

  // Ventana: desde el primer tramo de esas tareas, para que lo confirmado se reparta bien
  let windowStart = from
  if (taskIds.length) {
    const [{ min }] = await prisma.$queryRawUnsafe<{ min: Date | null }[]>(
      `SELECT MIN(started_at) AS min FROM task_time_segments WHERE task_id = ANY($1::uuid[])`,
      taskIds
    )
    const floor = new Date(from.getTime() - MAX_LOOKBACK_DAYS * 86400000)
    if (min && new Date(min) < windowStart) windowStart = new Date(Math.max(new Date(min).getTime(), floor.getTime()))
  }
  const rows = windowStart < from ? await segmentsOverlapping(windowStart, to) : inRange
  const table = computeMinutes(toSegments(rows), windowStart, to)

  const confirmed = await confirmedFor(taskIds)
  applyConfirmed(
    table,
    confirmed.map((c) => ({
      person: personKey(c.user_id, null),
      task: c.task_id,
      hours: c.hours,
      day: localDay(new Date(c.confirmed_at), DEFAULT_SCHEDULE.timeZone),
    }))
  )

  const taskSource = new Map<string, { source: string; project_id: string | null }>()
  for (const r of rows) taskSource.set(r.task_id, { source: r.source, project_id: r.project_id })
  for (const r of confirmedInRange) if (!taskSource.has(r.task_id)) taskSource.set(r.task_id, { source: r.source, project_id: null })
  return { table, taskSource }
}

export type HoursReportTask = {
  task_id: string
  title: string
  source: 'personal' | 'project'
  project_id: string | null
  project_name: string | null
  hours: number
  confirmed: boolean
}

export type HoursReportPerson = {
  key: string
  user_id: number | null
  name: string
  hours: number
  /** Horas por día (YYYY-MM-DD) */
  by_day: Record<string, number>
  by_project: { project_id: string | null; name: string; hours: number }[]
  tasks: HoursReportTask[]
}

export type HoursReport = {
  from: string
  to: string
  workday_hours: number
  people: HoursReportPerson[]
}

/** Horas por persona entre `from` y `to`. Con `onlyUserId`, solo las de esa persona. */
export async function getHoursReport(from: Date, to: Date, opts: { onlyUserId?: number } = {}): Promise<HoursReport> {
  const { table, taskSource } = await buildTable(from, to)
  const fromDay = localDay(from, DEFAULT_SCHEDULE.timeZone)
  const toDay = localDay(new Date(to.getTime() - 1), DEFAULT_SCHEDULE.timeZone)
  const onlyKey = opts.onlyUserId != null ? `u:${opts.onlyUserId}` : null

  const taskIds = Array.from(taskSource.keys())
  const [personal, project, users, confirmed] = await Promise.all([
    taskIds.length
      ? prisma.$queryRawUnsafe<{ id: string; title: string }[]>(`SELECT id::text, title FROM crm_user_tasks WHERE id = ANY($1::uuid[])`, taskIds).catch(() => [])
      : [],
    taskIds.length
      ? prisma.$queryRawUnsafe<{ id: string; title: string; project_id: string; project_name: string | null }[]>(
          `SELECT t.id::text, t.title, t.project_id::text, p.name AS project_name
             FROM project_dev_tasks t LEFT JOIN proyectos p ON p.id = t.project_id
            WHERE t.id = ANY($1::uuid[])`,
          taskIds
        )
      : [],
    prisma.$queryRawUnsafe<{ id: number; name: string }[]>(`SELECT id, name FROM crm_users`),
    confirmedFor(taskIds),
  ])
  const titles = new Map<string, { title: string; project_id: string | null; project_name: string | null }>()
  for (const t of personal) titles.set(t.id, { title: t.title, project_id: null, project_name: null })
  for (const t of project) titles.set(t.id, { title: t.title, project_id: t.project_id, project_name: t.project_name })
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const confirmedKey = new Set(confirmed.map((c) => `u:${c.user_id}|${c.task_id}`))

  const people: HoursReportPerson[] = []
  for (const [key, byTask] of Array.from(table.entries())) {
    if (onlyKey && key !== onlyKey) continue
    const byDay: Record<string, number> = {}
    const tasks: HoursReportTask[] = []
    const projects = new Map<string, { project_id: string | null; name: string; minutes: number }>()
    let total = 0
    for (const [taskId, days] of Array.from(byTask.entries())) {
      let minutes = 0
      for (const [day, m] of Array.from(days.entries())) {
        if (day < fromDay || day > toDay) continue
        minutes += m
        byDay[day] = (byDay[day] ?? 0) + m
      }
      if (minutes < 1) continue
      total += minutes
      const meta = titles.get(taskId)
      const src = taskSource.get(taskId)
      const projectId = meta?.project_id ?? src?.project_id ?? null
      tasks.push({
        task_id: taskId,
        title: meta?.title ?? 'Tarea eliminada',
        source: (src?.source === 'personal' ? 'personal' : 'project') as 'personal' | 'project',
        project_id: projectId,
        project_name: meta?.project_name ?? null,
        hours: toHours(minutes),
        confirmed: confirmedKey.has(`${key}|${taskId}`),
      })
      const pk = projectId ?? 'sueltas'
      const prev = projects.get(pk) ?? { project_id: projectId, name: meta?.project_name ?? (projectId ? 'Proyecto' : 'Tareas sueltas'), minutes: 0 }
      prev.minutes += minutes
      projects.set(pk, prev)
    }
    if (total < 1) continue
    const userId = key.startsWith('u:') ? Number(key.slice(2)) : null
    people.push({
      key,
      user_id: userId,
      name: userId != null ? userName.get(userId) ?? `Usuario ${userId}` : key.slice(2),
      hours: toHours(total),
      by_day: Object.fromEntries(Object.entries(byDay).map(([d, m]) => [d, toHours(m)])),
      by_project: Array.from(projects.values())
        .map((p) => ({ project_id: p.project_id, name: p.name, hours: toHours(p.minutes) }))
        .sort((a, b) => b.hours - a.hours),
      tasks: tasks.sort((a, b) => b.hours - a.hours),
    })
  }
  people.sort((a, b) => b.hours - a.hours)
  return { from: from.toISOString(), to: to.toISOString(), workday_hours: workdayMinutes() / 60, people }
}

/** Horas de una persona en una tarea: lo calculado y, si lo hay, lo que confirmó. */
export async function getTaskHours(
  userId: number,
  taskId: string
): Promise<{ took_part: boolean; computed: number; confirmed: number | null }> {
  const span = await prisma.$queryRawUnsafe<{ min: Date | null; mine: number }[]>(
    `SELECT MIN(started_at) AS min, COUNT(*) FILTER (WHERE user_id = $2)::int AS mine
       FROM task_time_segments WHERE task_id = $1::uuid`,
    taskId,
    userId
  )
  const [conf] = await prisma.$queryRawUnsafe<{ hours: unknown }[]>(
    `SELECT hours FROM task_hours_confirmed WHERE task_id = $1::uuid AND user_id = $2`,
    taskId,
    userId
  )
  const start = span[0]?.min ? new Date(span[0].min) : null
  let computed = 0
  if (start && span[0].mine > 0) {
    const now = new Date()
    const rows = await prisma.$queryRawUnsafe<SegmentRow[]>(
      `SELECT task_id::text, source, project_id::text, user_id, person_name, started_at, ended_at
         FROM task_time_segments
        WHERE user_id = $1 AND started_at < $3 AND (ended_at IS NULL OR ended_at > $2)`,
      userId,
      start,
      now
    )
    const table = computeMinutes(toSegments(rows), start, now)
    computed = toHours(taskTotal(table, `u:${userId}`, taskId))
  }
  return { took_part: (span[0]?.mine ?? 0) > 0, computed, confirmed: conf ? Number(conf.hours) : null }
}

export async function confirmTaskHours(input: {
  userId: number
  taskId: string
  source: 'personal' | 'project'
  hours: number
  computed: number | null
  by: string
}): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO task_hours_confirmed (task_id, user_id, source, hours, computed_hours, confirmed_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6)
     ON CONFLICT (task_id, user_id) DO UPDATE
       SET hours = EXCLUDED.hours, computed_hours = EXCLUDED.computed_hours,
           confirmed_at = NOW(), confirmed_by = EXCLUDED.confirmed_by`,
    input.taskId,
    input.userId,
    input.source,
    input.hours,
    input.computed,
    input.by
  )
}
