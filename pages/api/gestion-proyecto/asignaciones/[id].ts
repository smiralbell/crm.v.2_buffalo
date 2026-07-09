import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import {
  assertAssignmentAccess,
  getAssignmentById,
  updateAssignment,
} from '@/lib/developer/assignments'

const patchSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  try {
    const user = await requireAuthAPI(req, res)
    await assertAssignmentAccess(user, id)

    if (req.method === 'GET') {
      const assignment = await getAssignmentById(id)
      if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' })
      return res.status(200).json({ assignment })
    }

    if (req.method === 'PATCH') {
      const data = patchSchema.parse(req.body)
      const assignment = await getAssignmentById(id)
      if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' })

      const updated = await updateAssignment(id, assignment.user_id, data)
      if (!updated) return res.status(404).json({ error: 'Asignación no encontrada' })
      return res.status(200).json({ assignment: updated })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error) {
      if (['No session', 'Invalid session'].includes(error.message)) return
      if (error.message === 'Forbidden') {
        return res.status(403).json({ error: 'No tienes acceso a esta asignación' })
      }
    }
    console.error('[gestion-proyecto/asignaciones/[id]]', error)
    return res.status(500).json({ error: 'Error interno' })
  }
}
