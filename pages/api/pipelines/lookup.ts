import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/pipelines/lookup?entity_id=X
 * Finds the pipeline card for a given contact/entity ID.
 * Prioritises pipelines with "venta" in the name (Buffalo ventas).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await requireAuthAPI(req, res)

    const entity_id = req.query.entity_id as string
    if (!entity_id) return res.status(400).json({ error: 'entity_id requerido' })

    // Try 1: direct entity_id match (may be contact.id or lead.id)
    let cards = await prisma.pipelineCard.findMany({
      where: { entity_id: String(entity_id), deleted_at: null },
      include: { pipeline: { select: { id: true, name: true } } },
      orderBy: { created_at: 'desc' },
    })

    // Try 2: entity_id is a lead ID → look up via that lead's contact_id
    if (cards.length === 0) {
      const leadId = parseInt(entity_id)
      if (!isNaN(leadId)) {
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { contact_id: true },
        })
        if (lead?.contact_id) {
          cards = await prisma.pipelineCard.findMany({
            where: { entity_id: String(lead.contact_id), deleted_at: null },
            include: { pipeline: { select: { id: true, name: true } } },
            orderBy: { created_at: 'desc' },
          })
        }
      }
    }

    if (cards.length === 0) {
      return res.status(404).json({ error: 'No pipeline card found for this entity' })
    }

    // Prefer a pipeline whose name contains "venta" (Buffalo ventas)
    const preferred = cards.find(c =>
      c.pipeline.name.toLowerCase().includes('venta')
    ) || cards[0]

    return res.status(200).json({
      pipelineId:   preferred.pipeline_id,
      cardId:       preferred.id,
      pipelineName: preferred.pipeline.name,
      stage:        preferred.stage,
    })
  } catch (error: any) {
    console.error('Lookup error:', error)
    return res.status(500).json({ error: error.message })
  }
}
