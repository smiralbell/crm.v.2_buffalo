import { prisma } from '@/lib/prisma'

/** Resumen de carga de un usuario para la lista y la ficha de Usuarios. */
export interface UserWorkStats {
  projects_count: number
  open_tickets_count: number
  open_tasks_count: number
}

export async function getUserWorkStats(userId: number): Promise<UserWorkStats> {
  const stats: UserWorkStats = {
    projects_count: 0,
    open_tickets_count: 0,
    open_tasks_count: 0,
  }

  try {
    const projectRows = await prisma.$queryRaw<{ count: string }[]>`
      SELECT COUNT(*)::int AS count FROM crm_user_projects WHERE user_id = ${userId}
    `
    stats.projects_count = Number(projectRows[0]?.count ?? 0)
  } catch {
    // tabla opcional
  }

  try {
    const ticketRows = await prisma.$queryRaw<{ count: string }[]>`
      SELECT COUNT(*)::int AS count FROM tickets
      WHERE assignee_user_id = ${userId}
        AND status IN ('open', 'in_progress')
    `
    stats.open_tickets_count = Number(ticketRows[0]?.count ?? 0)
  } catch {
    // tabla opcional
  }

  try {
    const taskRows = await prisma.$queryRaw<{ count: string }[]>`
      SELECT COUNT(*)::int AS count
      FROM project_dev_tasks t
      INNER JOIN crm_user_projects up ON up.project_id = t.project_id
      WHERE up.user_id = ${userId}
        AND t.status IN ('pending', 'in_progress', 'buffalo_validation')
    `
    stats.open_tasks_count = Number(taskRows[0]?.count ?? 0)
  } catch {
    // tabla opcional
  }

  return stats
}
