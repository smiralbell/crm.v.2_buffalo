import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateCardSchema = z.object({
  stage: z.string().optional(),
  stage_color: z.string().optional(),
  tags: z.array(z.string()).optional(),
  capture_date: z.union([
    z.string().datetime(), // Formato ISO completo
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Formato YYYY-MM-DD
    z.string().length(0), // String vacío
  ]).transform((val) => {
    if (!val || val.length === 0) return null
    // Si es formato YYYY-MM-DD, convertir a ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return new Date(val + 'T00:00:00Z').toISOString()
    }
    return val
  }).optional().nullable(),
  amount: z.union([z.string(), z.number()]).transform((val) => val ? parseFloat(String(val)) : null).optional().nullable(),
  notes: z.string().optional().nullable(),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    const cardId = req.query.cardId as string

    if (!cardId) {
      return res.status(400).json({ error: 'card_id es requerido' })
    }

    if (req.method === 'GET') {
      const card = await prisma.pipelineCard.findUnique({
        where: { id: cardId },
        include: {
          pipeline: true,
        },
      })

      if (!card || card.deleted_at) {
        return res.status(404).json({ error: 'Tarjeta no encontrada' })
      }

      return res.status(200).json(card)
    }

    if (req.method === 'PUT') {
      const data = updateCardSchema.parse(req.body)

      const card = await prisma.pipelineCard.findUnique({
        where: { id: cardId },
      })

      if (!card || card.deleted_at) {
        return res.status(404).json({ error: 'Tarjeta no encontrada' })
      }

      const updated = await prisma.pipelineCard.update({
        where: { id: cardId },
        data: {
          ...(data.stage && { stage: data.stage }),
          ...(data.stage_color && { stage_color: data.stage_color }),
          ...(data.tags !== undefined && { tags: data.tags }),
          ...(data.capture_date !== undefined && { capture_date: data.capture_date ? new Date(data.capture_date) : null }),
          ...(data.amount !== undefined && { amount: data.amount }),
          ...(data.notes !== undefined && { notes: data.notes || null }),
        },
      })

      return res.status(200).json(updated)
    }

    if (req.method === 'DELETE') {
      // Soft delete
      const card = await prisma.pipelineCard.findUnique({
        where: { id: cardId },
      })

      if (!card || card.deleted_at) {
        return res.status(404).json({ error: 'Tarjeta no encontrada' })
      }

      const deleted = await prisma.pipelineCard.update({
        where: { id: cardId },
        data: {
          deleted_at: new Date(),
        },
      })

      return res.status(200).json(deleted)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Pipeline Card API error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    return res.status(500).json({ error: error.message || 'Error interno del servidor' })
  }
}

