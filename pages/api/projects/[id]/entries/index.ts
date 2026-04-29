import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  body: z.string().min(1, 'El texto es obligatorio'),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  /** ISO o valor de input datetime-local; si no viene, se usa ahora */
  created_at: z.string().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const projectId = parseInt(String(req.query.id), 10)
  if (Number.isNaN(projectId)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method === 'POST') {
    try {
      const project = await prisma.evaluationProject.findFirst({
        where: { id: projectId, deleted_at: null },
      })
      if (!project) {
        return res.status(404).json({ error: 'Proyecto no encontrado' })
      }

      const data = createSchema.parse(req.body)
      const createdAt = data.created_at ? new Date(data.created_at) : new Date()
      if (Number.isNaN(createdAt.getTime())) {
        return res.status(400).json({ error: 'Fecha de la nota inválida' })
      }
      const now = Date.now()
      if (createdAt.getTime() > now + 5 * 60 * 1000) {
        return res.status(400).json({ error: 'La fecha de la nota no puede ser futura' })
      }

      const entry = await prisma.projectJournalEntry.create({
        data: {
          project_id: projectId,
          body: data.body,
          rating: data.rating ?? null,
          created_at: createdAt,
        },
      })

      return res.status(201).json({
        entry: {
          id: entry.id,
          body: entry.body,
          rating: entry.rating,
          created_at: entry.created_at.toISOString(),
        },
      })
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.flatten() })
      }
      console.error('[projects entries POST]', e)
      return res.status(500).json({ error: 'Error al guardar entrada' })
    }
  }

  res.setHeader('Allow', 'POST')
  return res.status(405).json({ error: 'Método no permitido' })
}
