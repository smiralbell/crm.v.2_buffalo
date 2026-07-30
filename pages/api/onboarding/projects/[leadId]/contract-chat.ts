import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import { mergeLeadConfig } from '@/lib/onboarding/project-context-ai'
import { reviseContractAnnexWithChat } from '@/lib/onboarding/contract-annex-ai'

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
  save: z.boolean().optional().default(true),
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
        contact: {
          select: {
            nombre: true,
            empresa: true,
            cif: true,
            direccion_fiscal: true,
          },
        },
      },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const cfg = parseConfiguradorConfig(lead.configuracion)
    const context = (cfg?.project_context || '').trim()
    const definition = (cfg?.description || lead.notas || '').trim()
    const currentDraft = (body.draft ?? cfg?.contract_draft ?? '').trim()

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

    const result = await reviseContractAnnexWithChat({
      draft: currentDraft,
      instruction: body.instruction,
      meta: {
        context,
        definition,
        projectName: p?.name || cfg?.title || null,
        clientName: lead.contact?.nombre || null,
        clientCompany: lead.contact?.empresa || null,
        clientCif: lead.contact?.cif || null,
        clientAddress: lead.contact?.direccion_fiscal || null,
        setupFee: p?.setup_fee_eur ?? (lead.valor != null ? Number(lead.valor) : null),
        monthlyFee: p?.monthly_fee_eur ?? null,
        paymentSplit:
          cfg?.payment_split === '100_upfront' || cfg?.payment_split === '50_50'
            ? cfg.payment_split
            : null,
      },
      history: body.messages,
    })

    if (body.save) {
      const { encoded } = mergeLeadConfig(lead.configuracion, {
        contract_draft: result.content,
        contract_status: 'draft',
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
      contract_status: 'draft',
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
    console.error('[onboarding/projects/contract-chat]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error editando el contrato',
    })
  }
}
