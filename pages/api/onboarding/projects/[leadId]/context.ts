import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import {
  buildCrmContextSources,
  composeProjectContext,
  generateDefinitionFromContext,
  mergeLeadConfig,
  stripCrmSourcesBlock,
} from '@/lib/onboarding/project-context-ai'

const bodySchema = z.object({
  /** Texto manual del comercial (notas, lo hablado antes de la reunión, etc.) */
  context: z.string().optional(),
  /** Si true, añade auditoría + reuniones Fireflies al contexto antes de la IA */
  include_sources: z.boolean().optional().default(true),
  /**
   * Si true, solo guarda el contexto sin regenerar definición.
   * Por defecto false: al actualizar contexto → IA regenera definición.
   */
  skip_ai: z.boolean().optional().default(false),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)

    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const body = bodySchema.parse(req.body ?? {})
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: { select: { nombre: true, empresa: true } },
      },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const cfg = parseConfiguradorConfig(lead.configuracion)
    const rawManual = (body.context ?? cfg?.project_context ?? '').trim()
    const manual = body.include_sources !== false
      ? stripCrmSourcesBlock(rawManual)
      : rawManual

    let sources = ''
    if (body.include_sources !== false) {
      sources = await buildCrmContextSources(leadId)
    }

    const fullContext = body.include_sources !== false
      ? composeProjectContext({ manual, sources })
      : rawManual
    if (!fullContext.trim()) {
      return res.status(400).json({
        error: 'El contexto está vacío. Escribe notas o asegúrate de tener auditoría/reuniones.',
      })
    }

    let definition = (cfg?.description || lead.notas || '').trim()
    if (!body.skip_ai) {
      const proyectoRows = await prisma.$queryRaw<{ name: string }[]>`
        SELECT name FROM proyectos WHERE lead_id = ${leadId} LIMIT 1
      `
      definition = await generateDefinitionFromContext({
        context: fullContext,
        projectName: proyectoRows[0]?.name || cfg?.title || null,
        clientName: lead.contact?.nombre || null,
        clientCompany: lead.contact?.empresa || null,
        previousDefinition: definition || null,
      })
    }

    const { encoded } = mergeLeadConfig(lead.configuracion, {
      project_context: fullContext,
      description: definition || undefined,
      title: cfg?.title || undefined,
    })

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        configuracion: encoded,
        // La definición visible del proyecto también vive en notas (compat UI)
        ...(definition ? { notas: definition } : {}),
      },
    })

    return res.status(200).json({
      ok: true,
      context: fullContext,
      definition,
      definition_updated: !body.skip_ai,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[onboarding/projects/context]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error actualizando contexto',
    })
  }
}
