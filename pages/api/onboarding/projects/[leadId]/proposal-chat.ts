import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import {
  mergeLeadConfig,
  reviseProposalWithChat,
} from '@/lib/onboarding/project-context-ai'
import type { ProposalTurnMemory } from '@/lib/onboarding/proposal-memory'
import type { ProposalDiffStats } from '@/lib/onboarding/proposal-verify'

const bodySchema = z.object({
  instruction: z.string().min(1).max(4000),
  draft: z.string().max(200000).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
  /** Si true, guarda el resultado en proposal_draft */
  save: z.boolean().optional().default(true),
})

function toTurnMemory(raw: unknown): ProposalTurnMemory | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as {
    instruction?: unknown
    tools?: unknown
    sections?: unknown
    stats?: unknown
    satisfied?: unknown
  }
  if (typeof t.instruction !== 'string' || !t.stats || typeof t.stats !== 'object') {
    return null
  }
  return {
    instruction: t.instruction,
    tools: Array.isArray(t.tools) ? t.tools.map(String) : [],
    sections: Array.isArray(t.sections) ? t.sections.map(String) : [],
    stats: t.stats as ProposalDiffStats,
    satisfied: Boolean(t.satisfied),
  }
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
    const context = (cfg?.project_context || '').trim()
    const definition = (cfg?.description || lead.notas || '').trim()
    const currentDraft = (body.draft ?? cfg?.proposal_draft ?? '').trim()
    const lastTurn = toTurnMemory(cfg?.proposal_last_turn)

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

    const result = await reviseProposalWithChat({
      draft: currentDraft,
      instruction: body.instruction,
      context,
      definition,
      projectName: p?.name || cfg?.title || null,
      clientName: lead.contact?.nombre || null,
      clientCompany: lead.contact?.empresa || null,
      setupFee: p?.setup_fee_eur ?? (lead.valor != null ? Number(lead.valor) : null),
      monthlyFee: p?.monthly_fee_eur ?? null,
      history: body.messages,
      lastTurn,
    })

    if (body.save) {
      const { encoded } = mergeLeadConfig(lead.configuracion, {
        proposal_draft: result.content,
        proposal_status: 'draft',
        ...(result.turnMemory
          ? {
              proposal_last_turn: {
                instruction: result.turnMemory.instruction,
                tools: result.turnMemory.tools,
                sections: result.turnMemory.sections,
                stats: result.turnMemory.stats,
                satisfied: result.turnMemory.satisfied,
              },
            }
          : {}),
      })
      await prisma.lead.update({
        where: { id: leadId },
        data: { configuracion: encoded },
      })
    }

    return res.status(200).json({
      ok: true,
      content: result.content,
      note: result.note,
      theme: result.theme || null,
      proposal_status: 'draft',
      stats: result.stats ?? null,
      intentSatisfied: result.intentSatisfied ?? null,
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
    console.error('[onboarding/projects/proposal-chat]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error editando la propuesta',
    })
  }
}
