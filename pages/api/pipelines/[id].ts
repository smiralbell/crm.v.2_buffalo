import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isColdCallPipeline } from '@/lib/pipelines/cold-calling'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const user = await requireAuthAPI(req, res)

    const pipelineId = req.query.id as string

    if (!pipelineId) {
      return res.status(400).json({ error: 'pipeline_id es requerido' })
    }

    const pipeline = await prisma.pipelineKanban.findUnique({
      where: { id: pipelineId },
    })

    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline no encontrado' })
    }

    const coldCall = await isColdCallPipeline(pipelineId)
    if (user.role === 'comercial' && !coldCall) {
      return res.status(403).json({ error: 'Solo puedes acceder al pipeline de Cold Calling' })
    }
    if (user.role !== 'admin' && user.role !== 'comercial') {
      return res.status(403).json({ error: 'Acceso denegado' })
    }

    if (req.method === 'DELETE') {
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin puede eliminar pipelines' })
      }

      await prisma.pipelineCard.updateMany({
        where: {
          pipeline_id: pipelineId,
          deleted_at: null,
        },
        data: {
          deleted_at: new Date(),
        },
      })

      await prisma.pipelineKanban.delete({
        where: { id: pipelineId },
      })

      return res.status(200).json({ success: true })
    }

    if (req.method === 'GET') {
      const cards = await prisma.pipelineCard.findMany({
        where: {
          pipeline_id: pipelineId,
          deleted_at: null,
        },
      })

      const totalAmount = cards.reduce((sum, card) => {
        return sum + (card.amount ? Number(card.amount) : 0)
      }, 0)

      return res.status(200).json({
        pipeline,
        stats: {
          totalCards: cards.length,
          totalAmount,
        },
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: unknown) {
    console.error('Pipeline API error:', error)
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return res.status(500).json({ error: message })
  }
}
