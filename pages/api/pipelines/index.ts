import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { seedDefaultStagesForPipeline } from '@/lib/pipelines/stages'
import { getColdCallPipelineId } from '@/lib/pipelines/cold-calling'
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
    const user = await requireAuthAPI(req, res)

    if (req.method === 'GET') {
      const entityType = req.query.entity_type as string | undefined

      // Comercial: solo el pipeline de Cold Calling
      if (user.role === 'comercial') {
        const coldId = await getColdCallPipelineId()
        if (!coldId) return res.status(200).json({ pipelines: [] })
        const pipeline = await prisma.pipelineKanban.findUnique({
          where: { id: coldId },
          include: {
            _count: {
              select: { cards: { where: { deleted_at: null } } },
            },
          },
        })
        return res.status(200).json({ pipelines: pipeline ? [pipeline] : [] })
      }

      const where: Record<string, string> = {}
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
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin puede crear pipelines' })
      }
      const data = pipelineSchema.parse(req.body)

      const pipeline = await prisma.pipelineKanban.create({
        data: {
          name: data.name,
          entity_type: data.entity_type,
        },
      })

      await seedDefaultStagesForPipeline(pipeline.id)

      return res.status(201).json(pipeline)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: unknown) {
    console.error('Pipelines API error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return res.status(500).json({ error: message })
  }
}
