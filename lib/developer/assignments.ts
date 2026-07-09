import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'

export type AssignmentStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'

export interface DeveloperAssignment {
  id: string
  user_id: number
  title: string
  summary: string | null
  scope_text: string | null
  deliverables: string | null
  reference_links: string | null
  status: AssignmentStatus
  due_date: string | null
  created_at: string
  updated_at: string
}

type DbRow = {
  id: string
  user_id: number
  title: string
  summary: string | null
  scope_text: string | null
  deliverables: string | null
  reference_links: string | null
  status: AssignmentStatus
  due_date: Date | string | null
  created_at: Date
  updated_at: Date
}

function mapRow(r: DbRow): DeveloperAssignment {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    summary: r.summary,
    scope_text: r.scope_text,
    deliverables: r.deliverables,
    reference_links: r.reference_links,
    status: r.status,
    due_date: r.due_date
      ? r.due_date instanceof Date
        ? r.due_date.toISOString().slice(0, 10)
        : String(r.due_date).slice(0, 10)
      : null,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  }
}

export async function listAssignmentsForUser(userId: number): Promise<DeveloperAssignment[]> {
  try {
    const rows = await prisma.$queryRaw<DbRow[]>`
      SELECT id, user_id, title, summary, scope_text, deliverables, reference_links,
             status, due_date, created_at, updated_at
      FROM developer_assignments
      WHERE user_id = ${userId}
        AND status NOT IN ('done', 'cancelled')
      ORDER BY updated_at DESC
    `
    return rows.map(mapRow)
  } catch {
    return []
  }
}

export async function listAllAssignmentsForUser(userId: number): Promise<DeveloperAssignment[]> {
  try {
    const rows = await prisma.$queryRaw<DbRow[]>`
      SELECT id, user_id, title, summary, scope_text, deliverables, reference_links,
             status, due_date, created_at, updated_at
      FROM developer_assignments
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
    `
    return rows.map(mapRow)
  } catch {
    return []
  }
}

export async function countOpenAssignmentsForUser(userId: number): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<{ count: string }[]>`
      SELECT COUNT(*)::int AS count
      FROM developer_assignments
      WHERE user_id = ${userId}
        AND status NOT IN ('done', 'cancelled')
    `
    return Number(rows[0]?.count ?? 0)
  } catch {
    return 0
  }
}

export async function getAssignmentById(id: string): Promise<DeveloperAssignment | null> {
  try {
    const rows = await prisma.$queryRaw<DbRow[]>`
      SELECT id, user_id, title, summary, scope_text, deliverables, reference_links,
             status, due_date, created_at, updated_at
      FROM developer_assignments
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    return rows[0] ? mapRow(rows[0]) : null
  } catch {
    return null
  }
}

export async function userHasAssignmentAccess(userId: number, assignmentId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM developer_assignments
      WHERE id = ${assignmentId}::uuid AND user_id = ${userId}
      LIMIT 1
    `
    return rows.length > 0
  } catch {
    return false
  }
}

export async function assertAssignmentAccess(
  user: AuthUser,
  assignmentId: string
): Promise<void> {
  if (user.role === 'admin') return
  const ok = await userHasAssignmentAccess(user.id, assignmentId)
  if (!ok) throw new Error('Forbidden')
}

export async function createAssignment(input: {
  user_id: number
  title: string
  summary?: string
  scope_text?: string
  deliverables?: string
  reference_links?: string
  due_date?: string | null
  status?: AssignmentStatus
}): Promise<DeveloperAssignment | null> {
  try {
    const rows = await prisma.$queryRaw<DbRow[]>`
      INSERT INTO developer_assignments (
        user_id, title, summary, scope_text, deliverables, reference_links,
        due_date, status, created_at, updated_at
      ) VALUES (
        ${input.user_id},
        ${input.title.trim()},
        ${input.summary?.trim() || null},
        ${input.scope_text?.trim() || null},
        ${input.deliverables?.trim() || null},
        ${input.reference_links?.trim() || null},
        ${input.due_date ? new Date(input.due_date) : null}::date,
        ${input.status || 'in_progress'},
        NOW(),
        NOW()
      )
      RETURNING id, user_id, title, summary, scope_text, deliverables, reference_links,
                status, due_date, created_at, updated_at
    `
    return rows[0] ? mapRow(rows[0]) : null
  } catch {
    return null
  }
}

export async function updateAssignment(
  id: string,
  userId: number,
  patch: Partial<{
    title: string
    summary: string | null
    scope_text: string | null
    deliverables: string | null
    reference_links: string | null
    due_date: string | null
    status: AssignmentStatus
  }>
): Promise<DeveloperAssignment | null> {
  const current = await getAssignmentById(id)
  if (!current || current.user_id !== userId) return null

  try {
    const rows = await prisma.$queryRaw<DbRow[]>`
      UPDATE developer_assignments SET
        title = ${patch.title?.trim() ?? current.title},
        summary = ${patch.summary !== undefined ? patch.summary : current.summary},
        scope_text = ${patch.scope_text !== undefined ? patch.scope_text : current.scope_text},
        deliverables = ${patch.deliverables !== undefined ? patch.deliverables : current.deliverables},
        reference_links = ${patch.reference_links !== undefined ? patch.reference_links : current.reference_links},
        due_date = ${
          patch.due_date !== undefined
            ? patch.due_date
              ? new Date(patch.due_date)
              : null
            : current.due_date
              ? new Date(current.due_date)
              : null
        }::date,
        status = ${patch.status ?? current.status},
        updated_at = NOW()
      WHERE id = ${id}::uuid AND user_id = ${userId}
      RETURNING id, user_id, title, summary, scope_text, deliverables, reference_links,
                status, due_date, created_at, updated_at
    `
    return rows[0] ? mapRow(rows[0]) : null
  } catch {
    return null
  }
}

export async function deleteAssignment(id: string, userId: number): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      DELETE FROM developer_assignments
      WHERE id = ${id}::uuid AND user_id = ${userId}
      RETURNING id
    `
    return rows.length > 0
  } catch {
    return false
  }
}

export interface UserWorkStats {
  projects_count: number
  open_assignments_count: number
  open_tickets_count: number
  open_tasks_count: number
}

export async function getUserWorkStats(userId: number): Promise<UserWorkStats> {
  const stats: UserWorkStats = {
    projects_count: 0,
    open_assignments_count: 0,
    open_tickets_count: 0,
    open_tasks_count: 0,
  }

  try {
    const projectRows = await prisma.$queryRaw<{ count: string }[]>`
      SELECT COUNT(*)::int AS count FROM crm_user_projects WHERE user_id = ${userId}
    `
    stats.projects_count = Number(projectRows[0]?.count ?? 0)
  } catch {
    // optional table
  }

  stats.open_assignments_count = await countOpenAssignmentsForUser(userId)

  try {
    const ticketRows = await prisma.$queryRaw<{ count: string }[]>`
      SELECT COUNT(*)::int AS count FROM tickets
      WHERE assignee_user_id = ${userId}
        AND status IN ('open', 'in_progress')
    `
    stats.open_tickets_count = Number(ticketRows[0]?.count ?? 0)
  } catch {
    // optional
  }

  try {
    const taskRows = await prisma.$queryRaw<{ count: string }[]>`
      SELECT COUNT(*)::int AS count
      FROM project_dev_tasks t
      INNER JOIN crm_user_projects up ON up.project_id = t.project_id
      WHERE up.user_id = ${userId}
        AND t.status IN ('pending', 'in_progress')
    `
    stats.open_tasks_count = Number(taskRows[0]?.count ?? 0)
  } catch {
    // optional
  }

  return stats
}
