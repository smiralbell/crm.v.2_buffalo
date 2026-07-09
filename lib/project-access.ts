import type { NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'

export interface ProjectDeveloper {
  id: number
  name: string
  email: string
}

export async function userHasProjectAccess(userId: number, projectId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM crm_user_projects
      WHERE user_id = ${userId} AND project_id = ${projectId}::uuid
      LIMIT 1
    `
    return rows.length > 0
  } catch {
    return false
  }
}

/** null = todos los proyectos (admin) */
export async function getAccessibleProjectIds(user: AuthUser): Promise<string[] | null> {
  if (user.role === 'admin') return null
  try {
    const rows = await prisma.$queryRaw<{ project_id: string }[]>`
      SELECT project_id::text AS project_id
      FROM crm_user_projects
      WHERE user_id = ${user.id}
    `
    return rows.map((r) => r.project_id)
  } catch {
    return []
  }
}

export async function assertProjectAccess(
  user: AuthUser,
  projectId: string,
  res: NextApiResponse
): Promise<void> {
  if (user.role === 'admin') return
  const ok = await userHasProjectAccess(user.id, projectId)
  if (!ok) {
    res.status(403).json({ error: 'No tienes acceso a este proyecto' })
    throw new Error('Forbidden')
  }
}

export async function getProjectDevelopers(projectId: string): Promise<ProjectDeveloper[]> {
  try {
    const rows = await prisma.$queryRaw<ProjectDeveloper[]>`
      SELECT u.id, u.name, u.email
      FROM crm_user_projects up
      JOIN crm_users u ON u.id = up.user_id
      WHERE up.project_id = ${projectId}::uuid AND u.active = TRUE
      ORDER BY u.name ASC
    `
    return rows
  } catch {
    return []
  }
}

export async function getDevelopersByProjectIds(
  projectIds: string[]
): Promise<Record<string, ProjectDeveloper[]>> {
  const map: Record<string, ProjectDeveloper[]> = {}
  if (projectIds.length === 0) return map
  try {
    const rows = await prisma.$queryRaw<
      { project_id: string; id: number; name: string; email: string }[]
    >`
      SELECT up.project_id::text AS project_id, u.id, u.name, u.email
      FROM crm_user_projects up
      JOIN crm_users u ON u.id = up.user_id
      WHERE up.project_id = ANY(${projectIds}::uuid[]) AND u.active = TRUE
      ORDER BY u.name ASC
    `
    for (const row of rows) {
      if (!map[row.project_id]) map[row.project_id] = []
      map[row.project_id].push({ id: row.id, name: row.name, email: row.email })
    }
  } catch {
    // tabla opcional
  }
  return map
}

export async function setProjectDevelopers(
  projectId: string,
  userIds: number[]
): Promise<ProjectDeveloper[]> {
  await prisma.$executeRaw`
    DELETE FROM crm_user_projects WHERE project_id = ${projectId}::uuid
  `
  for (const userId of userIds) {
    await prisma.$executeRaw`
      INSERT INTO crm_user_projects (user_id, project_id)
      VALUES (${userId}, ${projectId}::uuid)
      ON CONFLICT DO NOTHING
    `
  }
  return getProjectDevelopers(projectId)
}
