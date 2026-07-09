import { prisma } from '@/lib/prisma'
import { getAccessibleProjectIds } from '@/lib/project-access'
import type { AuthUser } from '@/lib/auth'

export interface DeveloperDashboardStats {
  projects_count: number
  open_tasks: number
  done_tasks: number
  estimated_hours_open: number
  estimated_hours_done: number
  tickets_open: number
  tickets_in_progress: number
  retention_projects: number
  retention_review_due: number
  invoices_count: number
  invoices_total_con_iva: number
  invoices_pending_draft: number
}

const EMPTY: DeveloperDashboardStats = {
  projects_count: 0,
  open_tasks: 0,
  done_tasks: 0,
  estimated_hours_open: 0,
  estimated_hours_done: 0,
  tickets_open: 0,
  tickets_in_progress: 0,
  retention_projects: 0,
  retention_review_due: 0,
  invoices_count: 0,
  invoices_total_con_iva: 0,
  invoices_pending_draft: 0,
}

const DEFAULT_HOURS: Record<string, number> = { low: 2, medium: 4, high: 8 }

function taskHours(priority: string, estimated: number | null): number {
  if (estimated != null && estimated > 0) return Number(estimated)
  return DEFAULT_HOURS[priority] ?? 4
}

export async function getDeveloperDashboardStats(user: AuthUser): Promise<DeveloperDashboardStats> {
  const projectIds = await getAccessibleProjectIds(user)
  if (projectIds !== null && projectIds.length === 0) return EMPTY

  const stats = { ...EMPTY }

  try {
    if (projectIds && projectIds.length > 0) {
      stats.projects_count = projectIds.length

      const taskRows = await prisma.$queryRaw<
        { status: string; priority: string; estimated_hours: number | null; count: string }[]
      >`
        SELECT status, priority, estimated_hours, COUNT(*)::int AS count
        FROM project_dev_tasks
        WHERE project_id = ANY(${projectIds}::uuid[])
        GROUP BY status, priority, estimated_hours
      `
      for (const row of taskRows) {
        const n = Number(row.count)
        const h = taskHours(row.priority, row.estimated_hours)
        if (row.status === 'done') {
          stats.done_tasks += n
          stats.estimated_hours_done += h * n
        } else {
          stats.open_tasks += n
          stats.estimated_hours_open += h * n
        }
      }

      const retentionRows = await prisma.$queryRaw<{ total: string; due: string }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE updated_at < date_trunc('month', NOW()))::int AS due
        FROM proyectos
        WHERE id = ANY(${projectIds}::uuid[])
          AND has_mensualidad = true
      `
      if (retentionRows[0]) {
        stats.retention_projects = Number(retentionRows[0].total)
        stats.retention_review_due = Number(retentionRows[0].due)
      }

      const ticketCounts = await prisma.$queryRaw<{ status: string; count: string }[]>`
        SELECT status, COUNT(*)::int AS count
        FROM tickets
        WHERE assignee_user_id = ${user.id}
          AND project_id = ANY(${projectIds}::uuid[])
        GROUP BY status
      `
      for (const row of ticketCounts) {
        if (row.status === 'open') stats.tickets_open = Number(row.count)
        if (row.status === 'in_progress') stats.tickets_in_progress = Number(row.count)
      }
    }

    try {
      const invRows = await prisma.$queryRaw<{ count: string; total: string; drafts: string }[]>`
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(total), 0)::float AS total,
          COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
        FROM invoices
        WHERE deleted_at IS NULL
          AND invoice_source = 'developer'
          AND crm_user_id = ${user.id}
      `
      if (invRows[0]) {
        stats.invoices_count = Number(invRows[0].count)
        stats.invoices_total_con_iva = Number(invRows[0].total)
        stats.invoices_pending_draft = Number(invRows[0].drafts)
      }
    } catch {
      // columnas opcionales
    }
  } catch {
    return EMPTY
  }

  return stats
}
