import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAdminAPI } from '@/lib/auth'
import { findCrmUserById } from '@/lib/crm-users'
import { prisma } from '@/lib/prisma'
import { getUserProjects, setUserProjects } from '@/lib/project-access'

const bodySchema = z.object({
  project_ids: z.array(z.string().uuid()),
})

/**
 * GET  /api/users/:id/projects → proyectos asignados + todos los disponibles
 * PUT  /api/users/:id/projects { project_ids } → sustituye la asignación
 * Solo admin. Es lo que limita Onboarding / Proyectos / Retención del project manager.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
    const userId = parseInt(String(req.query.id), 10)
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'ID inválido' })

    const target = await findCrmUserById(userId)
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' })

    if (req.method === 'GET') {
      const [assigned, available] = await Promise.all([
        getUserProjects(userId),
        prisma.$queryRaw<
          { id: string; name: string; status: string; service_type: string; lead_id: number | null; empresa: string | null }[]
        >`
          SELECT p.id::text AS id, p.name, p.status, p.service_type, p.lead_id,
                 c.empresa
          FROM proyectos p
          LEFT JOIN leads l ON l.id = p.lead_id
          LEFT JOIN contacts c ON c.id = l.contact_id
          WHERE p.lead_id IS NOT NULL
          ORDER BY p.name ASC
        `,
      ])
      return res.status(200).json({ assigned, available })
    }

    if (req.method === 'PUT') {
      const data = bodySchema.parse(req.body)
      const assigned = await setUserProjects(userId, Array.from(new Set(data.project_ids)))
      return res.status(200).json({ assigned })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    const msg = error instanceof Error ? error.message : ''
    if (msg === 'Forbidden' || msg === 'No session' || msg === 'Invalid session') return
    console.error('[users/[id]/projects]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
