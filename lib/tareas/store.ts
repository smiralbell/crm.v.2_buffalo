import { prisma } from '@/lib/prisma'
import { serializeTaskRow, STALE_EXTENSION_DAYS } from '@/lib/gestion-proyecto/task-stale'
import type { TaskPriority, TaskStatus } from '@/lib/gestion-proyecto/types'
import { normalizeSubtasks } from '@/lib/subtasks'
import { ensureProjectTaskSubtasksColumn } from '@/lib/gestion-proyecto/task-subtasks'
import type { WorkProject, WorkTask } from '@/lib/tareas/types'

/** Proyectos que se ven en el módulo Proyectos (mismo criterio que "Proyectos abiertos"). */
const OPEN_PROJECT_STATUSES = ['development', 'active', 'paused', 'done']

let schemaReady: Promise<void> | null = null

/** Crea la tabla de tareas sueltas la primera vez que se usa. */
export function ensureUserTasksSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS crm_user_tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id INTEGER NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          priority TEXT NOT NULL DEFAULT 'medium',
          estimated_hours DOUBLE PRECISION,
          due_date DATE,
          position INTEGER NOT NULL DEFAULT 0,
          status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          stale_extension_until TIMESTAMPTZ,
          stale_notice_active BOOLEAN NOT NULL DEFAULT FALSE,
          subtasks JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_by_id INTEGER,
          created_by_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_crm_user_tasks_user ON crm_user_tasks(user_id, status)`
      )
    })().catch((e) => {
      schemaReady = null
      throw e
    })
  }
  return schemaReady
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return v ? String(v) : new Date().toISOString()
}

function hours(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

type Row = Record<string, unknown>

function mapPersonalRow(row: Row): WorkTask {
  const s = serializeTaskRow(row)
  return {
    id: String(row.id),
    project_id: '',
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assignee: (row.owner_name as string | null) ?? null,
    estimated_hours: hours(row.estimated_hours),
    due_date: s.due_date,
    position: Number(row.position) || 0,
    status_changed_at: s.status_changed_at,
    stale_extension_until: s.stale_extension_until,
    stale_notice_active: s.stale_notice_active,
    subtasks: s.subtasks,
    attachments: [],
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    source: 'personal',
    project_name: null,
    owner_user_id: Number(row.user_id),
    created_by_id: row.created_by_id == null ? null : Number(row.created_by_id),
    created_by_name: (row.created_by_name as string | null) ?? null,
  }
}

function mapProjectRow(row: Row): WorkTask {
  const s = serializeTaskRow(row)
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assignee: (row.assignee as string | null) ?? null,
    estimated_hours: hours(row.estimated_hours),
    due_date: s.due_date,
    position: Number(row.position) || 0,
    status_changed_at: s.status_changed_at,
    stale_extension_until: s.stale_extension_until,
    stale_notice_active: s.stale_notice_active,
    subtasks: s.subtasks,
    attachments: [],
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    source: 'project',
    project_name: (row.project_name as string | null) ?? null,
    owner_user_id: null,
    created_by_id: null,
    created_by_name: null,
  }
}

const PERSONAL_SELECT = `
  SELECT t.*, u.name AS owner_name
  FROM crm_user_tasks t
  JOIN crm_users u ON u.id = t.user_id
`

/** Tareas sueltas. `userId` null = de todos (solo admin). */
export async function listPersonalTasks(userId: number | null): Promise<WorkTask[]> {
  await ensureUserTasksSchema()
  const rows =
    userId === null
      ? await prisma.$queryRawUnsafe<Row[]>(
          `${PERSONAL_SELECT} WHERE u.active = TRUE ORDER BY t.position ASC, t.created_at ASC`
        )
      : await prisma.$queryRawUnsafe<Row[]>(
          `${PERSONAL_SELECT} WHERE t.user_id = $1 ORDER BY t.position ASC, t.created_at ASC`,
          userId
        )
  return rows.map(mapPersonalRow)
}

export async function getPersonalTask(id: string): Promise<WorkTask | null> {
  await ensureUserTasksSchema()
  const rows = await prisma.$queryRawUnsafe<Row[]>(`${PERSONAL_SELECT} WHERE t.id = $1::uuid`, id)
  return rows[0] ? mapPersonalRow(rows[0]) : null
}

/** Proyectos abiertos. `projectIds` null = todos (admin). */
export async function listOpenProjects(projectIds: string[] | null): Promise<WorkProject[]> {
  if (projectIds && projectIds.length === 0) return []
  const rows =
    projectIds === null
      ? await prisma.$queryRaw<{ id: string; name: string }[]>`
          SELECT p.id::text AS id, p.name
          FROM proyectos p
          INNER JOIN leads l ON l.id = p.lead_id
          WHERE p.es_buffalo = TRUE
            AND p.status = ANY(${OPEN_PROJECT_STATUSES}::text[])
            AND l.configuracion IS NOT NULL AND l.configuracion <> ''
          ORDER BY p.name ASC
        `
      : await prisma.$queryRaw<{ id: string; name: string }[]>`
          SELECT p.id::text AS id, p.name
          FROM proyectos p
          INNER JOIN leads l ON l.id = p.lead_id
          WHERE p.es_buffalo = TRUE
            AND p.status = ANY(${OPEN_PROJECT_STATUSES}::text[])
            AND l.configuracion IS NOT NULL AND l.configuracion <> ''
            AND p.id = ANY(${projectIds}::uuid[])
          ORDER BY p.name ASC
        `
  return rows
}

/** Tareas de los proyectos indicados, con el nombre del proyecto. */
export async function listProjectTasks(projects: WorkProject[]): Promise<WorkTask[]> {
  if (projects.length === 0) return []
  const ids = projects.map((p) => p.id)
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT t.*, p.name AS project_name
    FROM project_dev_tasks t
    JOIN proyectos p ON p.id = t.project_id
    WHERE t.project_id = ANY(${ids}::uuid[])
    ORDER BY t.position ASC, t.created_at ASC
  `
  const tasks = rows.map(mapProjectRow)

  try {
    const attRows = await prisma.$queryRaw<
      {
        id: string
        task_id: string
        file_name: string
        mime_type: string | null
        file_size: number | null
        created_at: Date
      }[]
    >`
      SELECT id::text AS id, task_id::text AS task_id, file_name, mime_type, file_size, created_at
      FROM project_dev_task_attachments
      WHERE project_id = ANY(${ids}::uuid[])
      ORDER BY created_at ASC
    `
    const byTask = new Map<string, WorkTask['attachments']>()
    for (const a of attRows) {
      const list = byTask.get(a.task_id) ?? []
      list!.push({
        id: a.id,
        task_id: a.task_id,
        file_name: a.file_name,
        mime_type: a.mime_type,
        file_size: a.file_size == null ? null : Number(a.file_size),
        created_at: a.created_at.toISOString(),
      })
      byTask.set(a.task_id, list)
    }
    for (const t of tasks) t.attachments = byTask.get(t.id) ?? []
  } catch {
    // tabla de adjuntos opcional
  }
  return tasks
}

export interface CreatePersonalTaskInput {
  user_id: number
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  estimated_hours?: number | null
  due_date?: string | null
  /** Se normaliza al guardar */
  subtasks?: unknown[]
  created_by_id: number | null
  created_by_name: string
}

export async function createPersonalTask(input: CreatePersonalTaskInput): Promise<WorkTask> {
  await ensureUserTasksSchema()
  const status = input.status ?? 'pending'
  const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
    SELECT MAX(position)::int AS max_pos FROM crm_user_tasks
    WHERE user_id = ${input.user_id} AND status = ${status}
  `
  const position = (maxPos[0]?.max_pos ?? -1) + 1
  const subtasks = JSON.stringify(normalizeSubtasks(input.subtasks ?? []))
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO crm_user_tasks (
      user_id, title, description, status, priority, estimated_hours, due_date,
      position, subtasks, created_by_id, created_by_name
    ) VALUES (
      ${input.user_id}, ${input.title}, ${input.description ?? null}, ${status},
      ${input.priority ?? 'medium'}, ${input.estimated_hours ?? null}, ${input.due_date ?? null}::date,
      ${position}, ${subtasks}::jsonb, ${input.created_by_id}, ${input.created_by_name}
    )
    RETURNING id::text AS id
  `
  const created = await getPersonalTask(rows[0].id)
  if (!created) throw new Error('No se pudo crear la tarea')
  return created
}

export interface PersonalTaskPatch {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  estimated_hours?: number | null
  due_date?: string | null
  position?: number
  /** Se normaliza al guardar */
  subtasks?: unknown[]
  extend_stale?: boolean
  acknowledge_stale?: boolean
}

export async function updatePersonalTask(
  current: WorkTask,
  patch: PersonalTaskPatch
): Promise<WorkTask | null> {
  const id = current.id
  if (patch.subtasks !== undefined) {
    const subtasks = JSON.stringify(normalizeSubtasks(patch.subtasks))
    await prisma.$executeRaw`
      UPDATE crm_user_tasks SET subtasks = ${subtasks}::jsonb, updated_at = NOW()
      WHERE id = ${id}::uuid
    `
  }

  if (patch.extend_stale) {
    await prisma.$executeRaw`
      UPDATE crm_user_tasks SET
        stale_extension_until = NOW() + (${STALE_EXTENSION_DAYS}::int * INTERVAL '1 day'),
        stale_notice_active = TRUE,
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `
  } else if (patch.acknowledge_stale) {
    await prisma.$executeRaw`
      UPDATE crm_user_tasks SET
        stale_notice_active = FALSE,
        stale_extension_until = NULL,
        status_changed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `
  }

  const touchesFields = (
    ['title', 'description', 'status', 'priority', 'estimated_hours', 'due_date', 'position'] as const
  ).some((k) => patch[k] !== undefined)

  if (touchesFields) {
    const nextStatus = patch.status ?? current.status
    const statusChanged = patch.status !== undefined && patch.status !== current.status
    let nextPosition = patch.position ?? current.position
    if (statusChanged && patch.position === undefined) {
      const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
        SELECT MAX(position)::int AS max_pos FROM crm_user_tasks
        WHERE user_id = ${current.owner_user_id} AND status = ${nextStatus}
      `
      nextPosition = (maxPos[0]?.max_pos ?? -1) + 1
    }
    await prisma.$executeRaw`
      UPDATE crm_user_tasks SET
        title = ${patch.title ?? current.title},
        description = ${patch.description !== undefined ? patch.description : current.description},
        status = ${nextStatus},
        priority = ${patch.priority ?? current.priority},
        estimated_hours = ${patch.estimated_hours !== undefined ? patch.estimated_hours : current.estimated_hours},
        due_date = ${patch.due_date !== undefined ? patch.due_date : current.due_date}::date,
        position = ${nextPosition},
        status_changed_at = CASE WHEN ${statusChanged} THEN NOW() ELSE status_changed_at END,
        stale_notice_active = CASE WHEN ${statusChanged} THEN FALSE ELSE stale_notice_active END,
        stale_extension_until = CASE WHEN ${statusChanged} THEN NULL ELSE stale_extension_until END,
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `
  }

  return getPersonalTask(id)
}

export async function deletePersonalTask(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM crm_user_tasks WHERE id = ${id}::uuid`
}

// ——— Tareas de proyecto (para el agente de WhatsApp/Telegram) ———

export async function getProjectTask(id: string): Promise<WorkTask | null> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT t.*, p.name AS project_name
    FROM project_dev_tasks t
    JOIN proyectos p ON p.id = t.project_id
    WHERE t.id = ${id}::uuid
  `
  return rows[0] ? mapProjectRow(rows[0]) : null
}

export interface CreateProjectTaskInput {
  project_id: string
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: string | null
  estimated_hours?: number | null
  due_date?: string | null
  /** Se normaliza al guardar */
  subtasks?: unknown[]
}

export async function createProjectTask(input: CreateProjectTaskInput): Promise<WorkTask> {
  await ensureProjectTaskSubtasksColumn()
  const status = input.status ?? 'pending'
  const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
    SELECT MAX(position)::int AS max_pos FROM project_dev_tasks
    WHERE project_id = ${input.project_id}::uuid AND status = ${status}
  `
  const position = (maxPos[0]?.max_pos ?? -1) + 1
  const subtasks = JSON.stringify(normalizeSubtasks(input.subtasks ?? []))
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO project_dev_tasks (
      project_id, title, description, status, priority, assignee, estimated_hours,
      due_date, position, status_changed_at, subtasks
    ) VALUES (
      ${input.project_id}::uuid, ${input.title}, ${input.description ?? null}, ${status},
      ${input.priority ?? 'medium'}, ${input.assignee ?? null}, ${input.estimated_hours ?? null},
      ${input.due_date ?? null}::date, ${position}, NOW(), ${subtasks}::jsonb
    )
    RETURNING id::text AS id
  `
  const created = await getProjectTask(rows[0].id)
  if (!created) throw new Error('No se pudo crear la tarea')
  return created
}

export interface ProjectTaskPatch {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: string | null
  estimated_hours?: number | null
  due_date?: string | null
  subtasks?: unknown[]
}

export async function updateProjectTask(current: WorkTask, patch: ProjectTaskPatch): Promise<WorkTask | null> {
  if (patch.subtasks !== undefined) {
    await ensureProjectTaskSubtasksColumn()
    const subtasks = JSON.stringify(normalizeSubtasks(patch.subtasks))
    await prisma.$executeRaw`
      UPDATE project_dev_tasks SET subtasks = ${subtasks}::jsonb, updated_at = NOW()
      WHERE id = ${current.id}::uuid
    `
  }
  const touchesFields = (
    ['title', 'description', 'status', 'priority', 'assignee', 'estimated_hours', 'due_date'] as const
  ).some((k) => patch[k] !== undefined)
  if (touchesFields) {
    const nextStatus = patch.status ?? current.status
    const statusChanged = patch.status !== undefined && patch.status !== current.status
    let nextPosition = current.position
    if (statusChanged) {
      const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
        SELECT MAX(position)::int AS max_pos FROM project_dev_tasks
        WHERE project_id = ${current.project_id}::uuid AND status = ${nextStatus}
      `
      nextPosition = (maxPos[0]?.max_pos ?? -1) + 1
    }
    await prisma.$executeRaw`
      UPDATE project_dev_tasks SET
        title = ${patch.title ?? current.title},
        description = ${patch.description !== undefined ? patch.description : current.description},
        status = ${nextStatus},
        priority = ${patch.priority ?? current.priority},
        assignee = ${patch.assignee !== undefined ? patch.assignee : current.assignee},
        estimated_hours = ${patch.estimated_hours !== undefined ? patch.estimated_hours : current.estimated_hours},
        due_date = ${patch.due_date !== undefined ? patch.due_date : current.due_date}::date,
        position = ${nextPosition},
        status_changed_at = CASE WHEN ${statusChanged} THEN NOW() ELSE status_changed_at END,
        stale_notice_active = CASE WHEN ${statusChanged} THEN FALSE ELSE stale_notice_active END,
        stale_extension_until = CASE WHEN ${statusChanged} THEN NULL ELSE stale_extension_until END,
        updated_at = NOW()
      WHERE id = ${current.id}::uuid
    `
  }
  return getProjectTask(current.id)
}

/** Pasa una tarea suelta a otra persona (la deja al final de su columna). */
export async function reassignPersonalTask(current: WorkTask, userId: number): Promise<WorkTask | null> {
  const maxPos = await prisma.$queryRaw<{ max_pos: number | null }[]>`
    SELECT MAX(position)::int AS max_pos FROM crm_user_tasks
    WHERE user_id = ${userId} AND status = ${current.status}
  `
  const position = (maxPos[0]?.max_pos ?? -1) + 1
  await prisma.$executeRaw`
    UPDATE crm_user_tasks SET user_id = ${userId}, position = ${position}, updated_at = NOW()
    WHERE id = ${current.id}::uuid
  `
  return getPersonalTask(current.id)
}
