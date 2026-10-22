import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { isAdmin } from '@/lib/auth-rbac'
import { ensureProjectStatusDoneAllowed } from '@/lib/gestion-proyecto/project-status'

/**
 * POST /api/gestion-proyecto/proyectos/[id]/produccion
 * Pasa el proyecto a producción (status = active).
 * Independiente de Finalizado: unos proyectos finalizan y se quedan done;
 * otros pasan a live.
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
      return res.status(403).json({ error: 'Solo admin puede pasar un proyecto a producción' })
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

    const runUpdate = () =>
      prisma.$queryRaw<{ id: string; status: string; fecha_fin_real: Date | null }[]>`
        UPDATE proyectos
        SET
          status = 'active',
          fecha_fin_real = COALESCE(fecha_fin_real, CURRENT_DATE),
          launched_at = COALESCE(launched_at, CURRENT_DATE),
          updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING id, status, fecha_fin_real
      `

    let updated: { id: string; status: string; fecha_fin_real: Date | null }[]
    try {
      updated = await runUpdate()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('proyectos_status') || msg.includes('check constraint') || msg.includes('done')) {
        await ensureProjectStatusDoneAllowed((sql) => prisma.$executeRawUnsafe(sql))
        updated = await runUpdate()
      } else {
        throw e
      }
    }

    return res.status(200).json({
      success: true,
      proyecto: {
        id: updated[0]?.id,
        status: updated[0]?.status,
        fecha_fin_real: updated[0]?.fecha_fin_real
          ? String(updated[0].fecha_fin_real).slice(0, 10)
          : null,
      },
      label: 'En producción',
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
    console.error('[produccion-proyecto]', error)
    return res.status(500).json({ error: 'Error al pasar el proyecto a producción' })
  }
}
