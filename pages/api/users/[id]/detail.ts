import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { findCrmUserById, getCrmUserAdminPassword } from '@/lib/crm-users'
import { getUserWorkStats, listAllAssignmentsForUser } from '@/lib/developer/assignments'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await requireAdminAPI(req, res)
    const userId = parseInt(String(req.query.id), 10)
    if (Number.isNaN(userId)) return res.status(400).json({ error: 'ID inválido' })

    const user = await findCrmUserById(userId)
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const stats = await getUserWorkStats(userId)
    const assignments = await listAllAssignmentsForUser(userId)
    const adminPassword = await getCrmUserAdminPassword(userId)

    let projects: { id: string; name: string; status: string; service_type: string }[] = []
    try {
      projects = await prisma.$queryRaw`
        SELECT p.id, p.name, p.status, p.service_type
        FROM crm_user_projects up
        INNER JOIN proyectos p ON p.id = up.project_id
        WHERE up.user_id = ${userId}
        ORDER BY p.name ASC
      `
    } catch {
      projects = []
    }

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      },
      stats,
      projects,
      assignments,
      credentials: {
        email: user.email,
        password: adminPassword,
      },
    })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[users/[id]/detail]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
