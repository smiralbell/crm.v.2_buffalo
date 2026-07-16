import { prisma } from '@/lib/prisma'
import { BUFFALO_STAGE_COLORS, defaultStageColor } from '@/lib/pipelines/defaults'
import { getGlobalPipelineId } from '@/lib/pipelines/global-funnel'

export type OnboardingPipelineAction =
  | 'crear_proyecto'
  | 'enviar_propuesta'
  | 'enviar_contrato'
  | 'enviar_factura'
  | 'enviar_onboarding'
  | 'onboarding_recibido'

/** Etapas lógicas del embudo comercial Buffalo */
export const ONBOARDING_ACTION_STAGE: Record<OnboardingPipelineAction, string> = {
  crear_proyecto: 'PROPUESTA CREADA',
  enviar_propuesta: 'PROPUESTA ENVIADA',
  enviar_contrato: 'CONTRATO ENVIADO',
  enviar_factura: 'FACTURA EMITIDA',
  enviar_onboarding: 'ONBOARDING',
  onboarding_recibido: 'EN DESARROLLO',
}

const STAGE_ORDER = [
  'LEAD',
  'CONTACTO',
  'REUNION',
  'PROPUESTA CREADA',
  'PROPUESTA ENVIADA',
  'CONTRATO ENVIADO',
  'CONTRATO FIRMADO',
  'FACTURA EMITIDA',
  'ONBOARDING',
  'EN DESARROLLO',
  'ACTIVO',
  'REMARKETING',
] as const

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function stageRank(name: string): number {
  const n = normalize(name)
  const idx = STAGE_ORDER.findIndex((s) => normalize(s) === n)
  if (idx >= 0) return idx
  if (n.includes('PROPUESTA') && n.includes('CREAD')) return 3
  if (n.includes('PROPUESTA') && n.includes('ENVIAD')) return 4
  if (n.includes('CONTRATO') && n.includes('ENVIAD')) return 5
  if (n.includes('CONTRATO') && n.includes('FIRM')) return 6
  if (n.includes('FACTURA')) return 7
  if (n.includes('ONBOARDING')) return 8
  if (n.includes('DESARROLLO')) return 9
  if (n.includes('REUNION')) return 2
  if (n.includes('CONTACTO')) return 1
  if (n.includes('LEAD')) return 0
  return -1
}

async function ensureOnboardingStages(pipelineId: string): Promise<void> {
  const needed = [
    'PROPUESTA CREADA',
    'PROPUESTA ENVIADA',
    'CONTRATO ENVIADO',
    'CONTRATO FIRMADO',
    'FACTURA EMITIDA',
    'ONBOARDING',
    'EN DESARROLLO',
  ]
  const existing = await prisma.pipelineStage.findMany({
    where: { pipeline_id: pipelineId },
    select: { name: true, position: true },
  })
  const byNorm = new Map(existing.map((s) => [normalize(s.name), s.name]))
  let nextPos = existing.reduce((m, s) => Math.max(m, s.position), -1) + 1

  for (const name of needed) {
    if (byNorm.has(normalize(name))) continue
    await prisma.pipelineStage.create({
      data: {
        pipeline_id: pipelineId,
        name,
        color: BUFFALO_STAGE_COLORS[name] || defaultStageColor(name),
        position: nextPos++,
      },
    })
  }
}

async function resolveStageName(pipelineId: string, logical: string): Promise<string> {
  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline_id: pipelineId },
    select: { name: true },
    orderBy: { position: 'asc' },
  })
  const target = normalize(logical)
  const exact = stages.find((s) => normalize(s.name) === target)
  if (exact) return exact.name

  // Fuzzy: PROPUESTA CREADA / ENVIADA, CONTRATO ENVIADO / FIRMADO, etc.
  if (target.includes('PROPUESTA') && target.includes('CREAD')) {
    const hit = stages.find((s) => {
      const n = normalize(s.name)
      return n.includes('PROPUESTA') && (n.includes('CREAD') || n.includes('GENERAD'))
    })
    if (hit) return hit.name
  }
  if (target.includes('PROPUESTA') && target.includes('ENVIAD')) {
    const hit = stages.find((s) => {
      const n = normalize(s.name)
      return n.includes('PROPUESTA') && n.includes('ENVIAD')
    })
    if (hit) return hit.name
  }
  if (target.includes('CONTRATO') && target.includes('ENVIAD')) {
    const hit = stages.find((s) => {
      const n = normalize(s.name)
      return n.includes('CONTRATO') && n.includes('ENVIAD')
    })
    if (hit) return hit.name
  }
  if (target.includes('CONTRATO') && target.includes('FIRM')) {
    const hit = stages.find((s) => {
      const n = normalize(s.name)
      return n.includes('CONTRATO') && n.includes('FIRM')
    })
    if (hit) return hit.name
  }
  if (target.includes('FACTURA')) {
    const hit = stages.find((s) => normalize(s.name).includes('FACTURA'))
    if (hit) return hit.name
  }
  if (target.includes('ONBOARDING')) {
    const hit = stages.find((s) => normalize(s.name).includes('ONBOARDING'))
    if (hit) return hit.name
  }
  if (target.includes('DESARROLLO')) {
    const hit = stages.find((s) => normalize(s.name).includes('DESARROLLO'))
    if (hit) return hit.name
  }

  return logical
}

async function nextPosition(pipelineId: string, stage: string): Promise<number> {
  const last = await prisma.pipelineCard.findFirst({
    where: { pipeline_id: pipelineId, stage, deleted_at: null },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  return last ? last.position + 1 : 0
}

/**
 * Avanza (solo adelante) la tarjeta del lead en el pipeline global Buffalo.
 */
export async function advanceLeadOnGlobalPipeline(
  leadId: number,
  action: OnboardingPipelineAction,
  opts?: { amount?: number | null; notes?: string | null }
): Promise<{ ok: boolean; stage?: string; cardId?: string; reason?: string }> {
  const pipelineId = await getGlobalPipelineId()
  if (!pipelineId) return { ok: false, reason: 'GLOBAL_PIPELINE_ID no configurado' }

  const pipeline = await prisma.pipelineKanban.findUnique({ where: { id: pipelineId } })
  if (!pipeline) return { ok: false, reason: 'Pipeline global no encontrado' }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, contact_id: true, valor: true },
  })
  if (!lead) return { ok: false, reason: 'Lead no encontrado' }

  await ensureOnboardingStages(pipelineId)

  const logical = ONBOARDING_ACTION_STAGE[action]
  const stage = await resolveStageName(pipelineId, logical)
  const entityId = String(lead.contact_id)

  let card = await prisma.pipelineCard.findFirst({
    where: { pipeline_id: pipelineId, entity_id: entityId, deleted_at: null },
  })

  if (!card) {
    // Fallback: tarjeta creada con lead.id por error
    card = await prisma.pipelineCard.findFirst({
      where: { pipeline_id: pipelineId, entity_id: String(leadId), deleted_at: null },
    })
    if (card) {
      await prisma.pipelineCard.update({
        where: { id: card.id },
        data: { entity_id: entityId },
      })
    }
  }

  const amount =
    opts?.amount != null && Number.isFinite(opts.amount)
      ? opts.amount
      : lead.valor != null
        ? Number(lead.valor)
        : null

  if (!card) {
    const position = await nextPosition(pipelineId, stage)
    const created = await prisma.pipelineCard.create({
      data: {
        pipeline_id: pipelineId,
        entity_id: entityId,
        entity_type: pipeline.entity_type === 'client' ? 'client' : 'contact',
        stage,
        stage_color: BUFFALO_STAGE_COLORS[stage] || defaultStageColor(stage),
        position,
        tags: ['onboarding'],
        notes: opts?.notes || null,
        amount: amount,
      },
    })
    return { ok: true, stage, cardId: created.id }
  }

  const currentRank = stageRank(card.stage)
  const targetRank = stageRank(stage)
  if (targetRank < currentRank) {
    // No retroceder (p. ej. ya en CONTRATO FIRMADO)
    return { ok: true, stage: card.stage, cardId: card.id, reason: 'already_further' }
  }

  const position =
    card.stage === stage ? card.position : await nextPosition(pipelineId, stage)

  await prisma.pipelineCard.update({
    where: { id: card.id },
    data: {
      stage,
      stage_color: BUFFALO_STAGE_COLORS[stage] || defaultStageColor(stage),
      position,
      ...(amount != null ? { amount } : {}),
      ...(opts?.notes ? { notes: opts.notes } : {}),
    },
  })

  return { ok: true, stage, cardId: card.id }
}

export async function advanceLeadOnGlobalByContactEmail(
  email: string,
  action: OnboardingPipelineAction
): Promise<{ ok: boolean; stage?: string; reason?: string }> {
  const contact = await prisma.contact.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
    include: { leads: { orderBy: { created_at: 'desc' }, take: 1 } },
  })
  const lead = contact?.leads[0]
  if (!lead) return { ok: false, reason: 'Lead no encontrado por email' }
  return advanceLeadOnGlobalPipeline(lead.id, action)
}
