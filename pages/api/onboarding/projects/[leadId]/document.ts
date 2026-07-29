import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import {
  generateOnboardingDoc,
  generateProposalFromContext,
  mergeLeadConfig,
} from '@/lib/onboarding/project-context-ai'

const bodySchema = z.object({
  kind: z.enum(['proposal', 'contract', 'pre_kickoff']),
  instructions: z.string().optional(),
  draft: z.string().optional(),
  save_only: z.boolean().optional().default(false),
})

function draftKey(kind: 'proposal' | 'contract' | 'pre_kickoff') {
  if (kind === 'proposal') return 'proposal_draft' as const
  if (kind === 'contract') return 'contract_draft' as const
  return 'pre_kickoff_draft' as const
}

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
      include: { contact: { select: { nombre: true, empresa: true } } },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const cfg = parseConfiguradorConfig(lead.configuracion)
    const key = draftKey(body.kind)

    if (body.save_only) {
      const draft = (body.draft || '').trim()
      const { encoded } = mergeLeadConfig(lead.configuracion, {
        [key]: draft || undefined,
      })
      await prisma.lead.update({
        where: { id: leadId },
        data: { configuracion: encoded },
      })
      return res.status(200).json({ ok: true, kind: body.kind, draft })
    }

    const context = (cfg?.project_context || '').trim()
    const definition = (cfg?.description || lead.notas || '').trim()
    const proyectoRows = await prisma.$queryRaw<
      { name: string; setup_fee_eur: number | null; monthly_fee_eur: number | null }[]
    >`
      SELECT name,
             setup_fee_eur::float8 AS setup_fee_eur,
             monthly_fee_eur::float8 AS monthly_fee_eur
      FROM proyectos
      WHERE lead_id = ${leadId}
      LIMIT 1
    `
    const p = proyectoRows[0]
    const meta = {
      context,
      definition,
      projectName: p?.name || cfg?.title || null,
      clientName: lead.contact?.nombre || null,
      clientCompany: lead.contact?.empresa || null,
      setupFee: p?.setup_fee_eur ?? (lead.valor != null ? Number(lead.valor) : null),
      monthlyFee: p?.monthly_fee_eur ?? null,
      extraInstructions: body.instructions || null,
    }

    const draft =
      body.kind === 'proposal'
        ? await generateProposalFromContext(meta)
        : await generateOnboardingDoc({ kind: body.kind, ...meta })

    const { encoded } = mergeLeadConfig(lead.configuracion, { [key]: draft })
    await prisma.lead.update({
      where: { id: leadId },
      data: { configuracion: encoded },
    })

    return res.status(200).json({ ok: true, kind: body.kind, draft })
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
    console.error('[onboarding/projects/document]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error generando documento',
    })
  }
}
