import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { z } from 'zod'
import {
  createPipelineStage,
  deletePipelineStage,
  getPipelineStages,
  movePipelineStage,
  reorderPipelineStages,
  updatePipelineStage,
} from '@/lib/pipelines/stages'

const editStageSchema = z.object({
  old_stage: z.string().min(1),
  new_stage: z.string().min(1),
  new_color: z.string().min(1),
})

const createStageSchema = z.object({
  stage_name: z.string().min(1),
  color: z.string().default('#3B82F6'),
  insert_at: z.number().int().min(0).optional(),
})

const reorderSchema = z.object({
  ordered_stage_ids: z.array(z.string().uuid()).min(1),
})

const moveSchema = z.object({
  stage_name: z.string().min(1),
  direction: z.enum(['left', 'right']),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    const pipelineId = req.query.id as string
    if (!pipelineId) {
      return res.status(400).json({ error: 'pipeline_id es requerido' })
    }

    if (req.method === 'GET') {
      const stages = await getPipelineStages(pipelineId)
      return res.status(200).json({ stages })
    }

    if (req.method === 'PUT') {
      if (req.body?.ordered_stage_ids) {
        const data = reorderSchema.parse(req.body)
        const stages = await reorderPipelineStages(pipelineId, data.ordered_stage_ids)
        return res.status(200).json({ stages })
      }

      if (req.body?.direction) {
        const data = moveSchema.parse(req.body)
        const stages = await movePipelineStage(pipelineId, data.stage_name, data.direction)
        return res.status(200).json({ stages })
      }

      const data = editStageSchema.parse(req.body)
      await updatePipelineStage(pipelineId, data.old_stage, data.new_stage, data.new_color)
      const stages = await getPipelineStages(pipelineId)
      return res.status(200).json({ stages })
    }

    if (req.method === 'POST') {
      const data = createStageSchema.parse(req.body)
      const stage = await createPipelineStage(
        pipelineId,
        data.stage_name,
        data.color,
        data.insert_at
      )
      const stages = await getPipelineStages(pipelineId)
      return res.status(201).json({ stage, stages })
    }

    if (req.method === 'DELETE') {
      const { stage_name } = req.body
      if (!stage_name) {
        return res.status(400).json({ error: 'stage_name es requerido' })
      }
      await deletePipelineStage(pipelineId, stage_name)
      const stages = await getPipelineStages(pipelineId)
      return res.status(200).json({ stages })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: unknown) {
    console.error('Pipeline Stages API error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return res.status(500).json({ error: message })
  }
}
