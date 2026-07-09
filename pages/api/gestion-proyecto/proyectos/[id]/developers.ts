import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI, requireAdminAPI } from '@/lib/auth'
import {
  assertProjectAccess,
  getProjectDevelopers,
  setProjectDevelopers,
} from '@/lib/project-access'

const bodySchema = z.object({
  user_ids: z.array(z.number().int().positive()),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const projectId = req.query.id as string
    if (!projectId) return res.status(400).json({ error: 'ID de proyecto requerido' })

    if (req.method === 'GET') {
      const user = await requireAuthAPI(req, res)
      await assertProjectAccess(user, projectId, res)
      const developers = await getProjectDevelopers(projectId)
      return res.status(200).json({ developers })
    }

    if (req.method === 'PUT') {
      await requireAdminAPI(req, res)
      const data = bodySchema.parse(req.body)
      const developers = await setProjectDevelopers(projectId, data.user_ids)
      return res.status(200).json({ developers })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('crm_user_projects') || msg.includes('does not exist')) {
      return res.status(500).json({
        error: 'Falta tabla crm_user_projects',
        hint: 'Ejecuta prisma/ALTER_CRM_USER_PROJECTS.sql en PostgreSQL.',
      })
    }
    if (msg === 'Forbidden' || msg === 'No session' || msg === 'Invalid session') return
    console.error('[gestion-proyecto/developers]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
