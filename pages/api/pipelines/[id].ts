import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    const pipelineId = req.query.id as string

    if (!pipelineId) {
      return res.status(400).json({ error: 'pipeline_id es requerido' })
    }

    // Verificar que el pipeline existe
    const pipeline = await prisma.pipelineKanban.findUnique({
      where: { id: pipelineId },
    })

    if (!pipeline) {
      return res.status(404).json({ error: 'Pipeline no encontrado' })
    }

    if (req.method === 'DELETE') {
      // Eliminar pipeline (soft delete de todas las tarjetas primero)
      // Primero hacer soft delete de todas las tarjetas
      await prisma.pipelineCard.updateMany({
        where: {
          pipeline_id: pipelineId,
          deleted_at: null,
        },
        data: {
          deleted_at: new Date(),
        },
      })

      // Luego eliminar el pipeline (hard delete ya que no tenemos soft delete en pipelines)
      await prisma.pipelineKanban.delete({
        where: { id: pipelineId },
      })

      return res.status(200).json({ success: true })
    }

    if (req.method === 'GET') {
      // Obtener pipeline con estadísticas
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
  } catch (error: any) {
    console.error('Pipeline API error:', error)
    return res.status(500).json({ error: error.message || 'Error interno del servidor' })
  }
}

