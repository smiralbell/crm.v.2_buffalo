import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import {
  advanceLeadOnGlobalPipeline,
  type OnboardingPipelineAction,
} from '@/lib/pipelines/onboarding-global'

const schema = z.object({
  leadId: z.number().int().positive(),
  action: z.enum([
    'crear_proyecto',
    'enviar_propuesta',
    'enviar_contrato',
    'enviar_factura',
    'enviar_onboarding',
    'onboarding_recibido',
  ]),
  amount: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = schema.parse(req.body)
    const result = await advanceLeadOnGlobalPipeline(
      body.leadId,
      body.action as OnboardingPipelineAction,
      { amount: body.amount, notes: body.notes }
    )
    return res.status(200).json(result)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[onboarding/pipeline-advance]', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
  }
}
