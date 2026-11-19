import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { isAdmin } from '@/lib/auth-rbac'

/**
 * POST /api/gestion-proyecto/proyectos/[id]/reabrir
 * Deshace Finalizado o En producción: el proyecto vuelve a En desarrollo
 * (status = development) y sale de Retención.
 * Borra las fechas que pusieron esos botones para que, si se vuelve a
 * finalizar o pasar a producción, se guarde la fecha real de ese momento.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  try {
    const user = await requireProjectAccessAPI(req, res, id)
    if (!isAdmin(user)) {
      return res.status(403).json({ error: 'Solo admin puede volver un proyecto a desarrollo' })
    }

    const existing = await prisma.$queryRaw<{ id: string; status: string; es_buffalo: boolean }[]>`
      SELECT id, status, es_buffalo
      FROM proyectos
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    const row = existing[0]
    if (!row) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!row.es_buffalo) {
      return res.status(400).json({ error: 'El proyecto no está en marcha' })
    }
    if (row.status !== 'active' && row.status !== 'done') {
      return res.status(400).json({ error: 'El proyecto ya está en desarrollo' })
    }

    const updated = await prisma.$queryRaw<{ id: string; status: string }[]>`
      UPDATE proyectos
      SET
        status = 'development',
        fecha_fin_real = NULL,
        launched_at = CASE WHEN status = 'active' THEN NULL ELSE launched_at END,
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, status
    `

    return res.status(200).json({
      success: true,
      proyecto: { id: updated[0]?.id, status: updated[0]?.status },
      label: 'En desarrollo',
    })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[reabrir-proyecto]', error)
    return res.status(500).json({ error: 'Error al volver el proyecto a desarrollo' })
  }
}
