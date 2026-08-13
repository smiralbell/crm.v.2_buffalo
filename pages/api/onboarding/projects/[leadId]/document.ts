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
import { generateContractAnnex } from '@/lib/onboarding/contract-annex-ai'
import { logCrmActivity } from '@/lib/crm/activities'
import { syncNotebookContextToLead } from '@/lib/onboarding/notes/sync-context'

const bodySchema = z.object({
  kind: z.enum(['proposal', 'contract', 'pre_kickoff']),
  instructions: z.string().optional(),
  draft: z.string().optional(),
  save_only: z.boolean().optional().default(false),
  /** Solo para propuestas: borrador | enviada */
  proposal_status: z.enum(['draft', 'sent']).optional(),
  /** Solo para contratos: borrador | enviado */
  contract_status: z.enum(['draft', 'sent']).optional(),
})

function draftKey(kind: 'proposal' | 'contract' | 'pre_kickoff') {
  if (kind === 'proposal') return 'proposal_draft' as const
  if (kind === 'contract') return 'contract_draft' as const
  return 'pre_kickoff_draft' as const
}

function docLabel(kind: 'proposal' | 'contract' | 'pre_kickoff') {
  if (kind === 'proposal') return 'Propuesta'
  if (kind === 'contract') return 'Contrato'
  return 'Pre-kickoff'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)

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
            id: true,
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
    const key = draftKey(body.kind)
    const label = docLabel(body.kind)

    if (body.save_only) {
      const draft = (body.draft || '').trim()
      const prevStatus =
        body.kind === 'proposal'
          ? cfg?.proposal_status
          : body.kind === 'contract'
            ? cfg?.contract_status
            : null
      const nextStatus =
        body.kind === 'proposal'
          ? body.proposal_status || 'draft'
          : body.kind === 'contract'
            ? body.contract_status || 'draft'
            : null
      const statusPatch =
        body.kind === 'proposal' && body.proposal_status
          ? {
              proposal_status: body.proposal_status,
              ...(body.proposal_status === 'sent'
                ? { proposal_sent_at: new Date().toISOString() }
                : {}),
            }
          : body.kind === 'proposal'
            ? { proposal_status: 'draft' as const }
            : body.kind === 'contract' && body.contract_status
              ? {
                  contract_status: body.contract_status,
                  ...(body.contract_status === 'sent'
                    ? { contract_sent_at: new Date().toISOString() }
                    : {}),
                }
              : body.kind === 'contract'
                ? { contract_status: 'draft' as const }
                : {}
      const { encoded } = mergeLeadConfig(lead.configuracion, {
        [key]: draft || undefined,
        ...statusPatch,
      })
      await prisma.lead.update({
        where: { id: leadId },
        data: { configuracion: encoded },
      })

      if (nextStatus === 'sent' && prevStatus !== 'sent') {
        await logCrmActivity({
          contactId: lead.contact?.id ?? lead.contact_id,
          leadId,
          kind: 'document',
          title: `${label} marcada como enviada`,
          body: null,
          meta: { doc_kind: body.kind, status: 'sent' },
          createdBy: user.email,
        })
      }

      return res.status(200).json({
        ok: true,
        kind: body.kind,
        draft,
        proposal_status:
          body.kind === 'proposal'
            ? body.proposal_status || 'draft'
            : undefined,
        contract_status:
          body.kind === 'contract'
            ? body.contract_status || 'draft'
            : undefined,
      })
    }

    const synced = await syncNotebookContextToLead({
      leadId,
      createdBy: user.email,
      applyDefinition: false,
      logActivity: false,
    })
    const context = synced.context.trim()
    const definition =
      (cfg?.description || lead.notas || synced.definition || '').trim()
    const proyectoRows = await prisma.$queryRaw<
      { name: string; setup_fee_eur: number | null; monthly_fee_eur: number | null; project_count: number }[]
    >`
      SELECT
        (array_agg(name ORDER BY created_at ASC NULLS LAST))[1] AS name,
        SUM(setup_fee_eur)::float8 AS setup_fee_eur,
        SUM(monthly_fee_eur)::float8 AS monthly_fee_eur,
        COUNT(*)::int AS project_count
      FROM proyectos
      WHERE lead_id = ${leadId}
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

    const hadDraft = Boolean((cfg?.[key] || '').trim())
    const draft =
      body.kind === 'proposal'
        ? await generateProposalFromContext(meta)
        : body.kind === 'contract'
          ? await generateContractAnnex({
              context: meta.context,
              definition: meta.definition,
              projectName: meta.projectName,
              clientName: meta.clientName,
              clientCompany: meta.clientCompany,
              clientCif: lead.contact?.cif || null,
              clientAddress: lead.contact?.direccion_fiscal || null,
              setupFee: meta.setupFee,
              monthlyFee: meta.monthlyFee,
              paymentSplit:
                cfg?.payment_split === '100_upfront' || cfg?.payment_split === '50_50'
                  ? cfg.payment_split
                  : null,
              extraInstructions: meta.extraInstructions,
            })
          : await generateOnboardingDoc({ kind: body.kind, ...meta })

    const { encoded } = mergeLeadConfig(lead.configuracion, {
      [key]: draft,
      ...(body.kind === 'proposal' ? { proposal_status: 'draft' as const } : {}),
      ...(body.kind === 'contract' ? { contract_status: 'draft' as const } : {}),
    })
    await prisma.lead.update({
      where: { id: leadId },
      data: { configuracion: encoded },
    })

    await logCrmActivity({
      contactId: lead.contact?.id ?? lead.contact_id,
      leadId,
      kind: 'document',
      title: hadDraft ? `${label} regenerada` : `${label} creada`,
      body: body.instructions?.trim() || null,
      meta: { doc_kind: body.kind },
      createdBy: user.email,
    })

    return res.status(200).json({
      ok: true,
      kind: body.kind,
      draft,
      proposal_status: body.kind === 'proposal' ? 'draft' : undefined,
      contract_status: body.kind === 'contract' ? 'draft' : undefined,
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
    console.error('[onboarding/projects/document]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error generando documento',
    })
  }
}
