import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAdminAPI } from '@/lib/auth'
import { deleteAssignment, getAssignmentById, updateAssignment } from '@/lib/developer/assignments'

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  scope_text: z.string().nullable().optional(),
  deliverables: z.string().nullable().optional(),
  reference_links: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
    const userId = parseInt(String(req.query.id), 10)
    const assignmentId = String(req.query.assignmentId || '')
    if (Number.isNaN(userId) || !assignmentId) {
      return res.status(400).json({ error: 'Parámetros inválidos' })
    }

    const existing = await getAssignmentById(assignmentId)
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({ error: 'Asignación no encontrada' })
    }

    if (req.method === 'PATCH') {
      const data = patchSchema.parse(req.body)
      const assignment = await updateAssignment(assignmentId, userId, data)
      if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' })
      return res.status(200).json({ assignment })
    }

    if (req.method === 'DELETE') {
      const ok = await deleteAssignment(assignmentId, userId)
      if (!ok) return res.status(404).json({ error: 'Asignación no encontrada' })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[users/[id]/assignments/[assignmentId]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
