import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAdminAPI } from '@/lib/auth'
import { findCrmUserById } from '@/lib/crm-users'
import { createAssignment, listAllAssignmentsForUser } from '@/lib/developer/assignments'

const createSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  summary: z.string().optional(),
  scope_text: z.string().optional(),
  deliverables: z.string().optional(),
  reference_links: z.string().optional(),
  due_date: z.string().optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
    const userId = parseInt(String(req.query.id), 10)
    if (Number.isNaN(userId)) return res.status(400).json({ error: 'ID inválido' })

    const user = await findCrmUserById(userId)
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    if (req.method === 'GET') {
      const assignments = await listAllAssignmentsForUser(userId)
      return res.status(200).json({ assignments })
    }

    if (req.method === 'POST') {
      const data = createSchema.parse(req.body)
      const assignment = await createAssignment({
        user_id: userId,
        ...data,
      })
      if (!assignment) {
        return res.status(500).json({
          error: 'No se pudo crear la asignación',
          hint: 'Ejecuta prisma/CREATE_DEVELOPER_ASSIGNMENTS.sql',
        })
      }
      return res.status(201).json({ assignment })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[users/[id]/assignments]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
