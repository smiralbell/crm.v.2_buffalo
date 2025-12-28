import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const pipelineSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  entity_type: z.enum(['client', 'contact'], {
    errorMap: () => ({ message: 'entity_type debe ser "client" o "contact"' }),
  }),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    if (req.method === 'GET') {
      const entityType = req.query.entity_type as string | undefined

      const where: any = {}
      if (entityType && (entityType === 'client' || entityType === 'contact')) {
        where.entity_type = entityType
      }

      const pipelines = await prisma.pipelineKanban.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: {
              cards: {
                where: {
                  deleted_at: null,
                },
              },
            },
          },
        },
      })

      return res.status(200).json({ pipelines })
    }

    if (req.method === 'POST') {
      const data = pipelineSchema.parse(req.body)

      const pipeline = await prisma.pipelineKanban.create({
        data: {
          name: data.name,
          entity_type: data.entity_type,
        },
      })

      return res.status(201).json(pipeline)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Pipelines API error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    return res.status(500).json({ error: error.message || 'Error interno del servidor' })
  }
}

// Endpoint para eliminar un pipeline específico
export async function deletePipeline(pipelineId: string) {
  // Este endpoint se manejará en [id].ts
}

