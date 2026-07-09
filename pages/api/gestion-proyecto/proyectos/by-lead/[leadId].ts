import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getProjectDevelopers } from '@/lib/project-access'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await requireAuthAPI(req, res)
    const leadId = parseInt(req.query.leadId as string, 10)
    if (!Number.isFinite(leadId)) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    const rows = await prisma.$queryRaw<
      { id: string; name: string; status: string; config_ref: string | null }[]
    >`
      SELECT id::text AS id, name, status, config_ref
      FROM proyectos
      WHERE lead_id = ${leadId}
      LIMIT 1
    `

    const proyecto = rows[0]
    if (!proyecto) {
      return res.status(404).json({
        error: 'Proyecto no sincronizado',
        hint: 'Guarda la configuración del lead para crear el proyecto en ENG 3.',
      })
    }

    const developers = await getProjectDevelopers(proyecto.id)

    return res.status(200).json({
      proyecto: {
        id: proyecto.id,
        name: proyecto.name,
        status: proyecto.status,
        config_ref: proyecto.config_ref,
      },
      developers,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg === 'No session' || msg === 'Invalid session') return
    console.error('[gestion-proyecto/by-lead]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
