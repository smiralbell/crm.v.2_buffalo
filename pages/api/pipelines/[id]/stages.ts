import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const editStageSchema = z.object({
  old_stage: z.string().min(1),
  new_stage: z.string().min(1),
  new_color: z.string(),
})

const createStageSchema = z.object({
  stage_name: z.string().min(1),
  color: z.string().default('#3B82F6'),
})

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

    if (req.method === 'PUT') {
      // Editar stage (renombrar y cambiar color)
      const data = editStageSchema.parse(req.body)

      // Actualizar todas las tarjetas con el stage anterior
      await prisma.pipelineCard.updateMany({
        where: {
          pipeline_id: pipelineId,
          stage: data.old_stage,
          deleted_at: null,
        },
        data: {
          stage: data.new_stage,
          stage_color: data.new_color,
        },
      })

      return res.status(200).json({ success: true })
    }

    if (req.method === 'POST') {
      // Crear nueva columna (stage)
      // No creamos nada en BD, solo retornamos éxito
      // La columna existirá cuando se cree la primera tarjeta
      const data = createStageSchema.parse(req.body)

      return res.status(200).json({
        stage: data.stage_name,
        color: data.color,
      })
    }

    if (req.method === 'DELETE') {
      // Eliminar stage (solo si no tiene tarjetas)
      const { stage_name } = req.body

      if (!stage_name) {
        return res.status(400).json({ error: 'stage_name es requerido' })
      }

      // Verificar que no tenga tarjetas
      const cardCount = await prisma.pipelineCard.count({
        where: {
          pipeline_id: pipelineId,
          stage: stage_name,
          deleted_at: null,
        },
      })

      if (cardCount > 0) {
        return res.status(400).json({
          error: 'No se puede eliminar una columna con tarjetas',
        })
      }

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Pipeline Stages API error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    return res.status(500).json({ error: error.message || 'Error interno del servidor' })
  }
}

