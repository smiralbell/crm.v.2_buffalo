import { prisma } from '@/lib/prisma'
import { BUFFALO_STAGE_COLORS, defaultStageColor } from '@/lib/pipelines/defaults'

/** Pipeline global Buffalo LEADS-VENTA — entrada desde columna REUNIÓN de WEB / Cold Calling */
export const DEFAULT_GLOBAL_PIPELINE_ID = 'c900485d-7395-4def-9149-ef98f3d406ce'
export const GLOBAL_FUNNEL_TAG = 'global-funnel'

export type GlobalFunnelSource = 'web' | 'coldcall'

function normalizeStage(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

export function isReunionStageName(name: string): boolean {
  return normalizeStage(name).includes('REUNION')
}

export async function getGlobalPipelineId(): Promise<string | null> {
  const fromEnv = process.env.GLOBAL_PIPELINE_ID?.trim() || process.env.BUFFALO_GLOBAL_PIPELINE_ID?.trim()
  if (fromEnv) return fromEnv
  return DEFAULT_GLOBAL_PIPELINE_ID
}

async function resolveReunionStageName(pipelineId: string): Promise<string | null> {
  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline_id: pipelineId },
    select: { name: true },
    orderBy: { position: 'asc' },
  })

  const reunion = stages.find((s) => isReunionStageName(s.name))
  if (reunion) return reunion.name

  // Fallback: primera columna si se llama REUNIÓN en defaults
  if (stages[0] && isReunionStageName(stages[0].name)) return stages[0].name

  // Si no hay stage en tabla, usar nombre estándar
  return stages.length === 0 ? 'REUNIÓN' : null
}

async function nextCardPosition(pipelineId: string, stage: string): Promise<number> {
  const last = await prisma.pipelineCard.findFirst({
    where: { pipeline_id: pipelineId, stage, deleted_at: null },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  return last ? last.position + 1 : 0
}

/**
 * Upsert tarjeta en la columna REUNIÓN del embudo global Buffalo.
 * entity_id = contact_id del CRM (mismo criterio que pipeline WEB).
 */
export async function syncContactToGlobalReunion(input: {
  contactId: number
  notes?: string | null
  source: GlobalFunnelSource
}): Promise<string | null> {
  const pipelineId = await getGlobalPipelineId()
  if (!pipelineId) return null

  const pipeline = await prisma.pipelineKanban.findUnique({
    where: { id: pipelineId },
    select: { id: true, entity_type: true },
  })
  if (!pipeline) {
    console.warn('[global-funnel] pipeline no encontrado', pipelineId)
    return null
  }

  const stage = await resolveReunionStageName(pipelineId)
  if (!stage) {
    console.warn('[global-funnel] no hay columna REUNIÓN en', pipelineId)
    return null
  }

  const entityId = String(input.contactId)
  const sourceTag = input.source === 'web' ? 'from-web' : 'from-coldcall'
  const existing = await prisma.pipelineCard.findFirst({
    where: {
      pipeline_id: pipelineId,
      entity_id: entityId,
      deleted_at: null,
    },
  })

  if (existing) {
    // Solo subir a REUNIÓN si está en una columna anterior o ya está ahí
    const alreadyFurther = !isReunionStageName(existing.stage) && stageRank(existing.stage) > stageRank(stage)
    if (alreadyFurther) {
      // Ya avanzó más allá en el embudo global — no lo devolvemos a REUNIÓN
      const tags = Array.from(new Set([...existing.tags, GLOBAL_FUNNEL_TAG, sourceTag]))
      await prisma.pipelineCard.update({
        where: { id: existing.id },
        data: { tags, notes: input.notes?.trim() || existing.notes },
      })
      return existing.id
    }

    const position =
      existing.stage === stage ? existing.position : await nextCardPosition(pipelineId, stage)
    const tags = Array.from(new Set([...existing.tags, GLOBAL_FUNNEL_TAG, sourceTag]))

    await prisma.pipelineCard.update({
      where: { id: existing.id },
      data: {
        stage,
        stage_color: BUFFALO_STAGE_COLORS[stage] || defaultStageColor(stage),
        position,
        tags,
        notes: input.notes?.trim() || existing.notes,
      },
    })
    return existing.id
  }

  const position = await nextCardPosition(pipelineId, stage)
  const card = await prisma.pipelineCard.create({
    data: {
      pipeline_id: pipelineId,
      entity_id: entityId,
      entity_type: pipeline.entity_type === 'client' ? 'client' : 'contact',
      stage,
      stage_color: BUFFALO_STAGE_COLORS[stage] || defaultStageColor(stage),
      position,
      tags: [GLOBAL_FUNNEL_TAG, sourceTag],
      notes: input.notes?.trim() || null,
    },
  })

  console.log('[global-funnel] card created', {
    cardId: card.id,
    contactId: input.contactId,
    source: input.source,
    stage,
  })

  return card.id
}

function stageRank(name: string): number {
  const n = normalizeStage(name)
  if (n.includes('LEAD')) return 1
  if (n.includes('CONTACTO') || n === 'CONTACT') return 2
  if (n.includes('REUNION')) return 3
  if (n.includes('PROPUESTA')) return 4
  if (n.includes('NEGOCI')) return 5
  if (n.includes('CONTRATO')) return 6
  if (n.includes('FACTURA')) return 7
  if (n.includes('ONBOARDING')) return 8
  if (n.includes('DESARROLLO')) return 9
  if (n.includes('ACTIVO')) return 10
  if (n.includes('REMARKET')) return 11
  return 0
}

export async function isGlobalPipeline(pipelineId: string): Promise<boolean> {
  return (await getGlobalPipelineId()) === pipelineId
}

/** Sincroniza tarjetas ya en REUNIÓN de WEB y Cold Calling hacia el embudo global. */
export async function backfillReunionsToGlobalFunnel(): Promise<number> {
  const { getWebPipelineId } = await import('@/lib/pipelines/web')
  const { getColdCallPipelineId } = await import('@/lib/pipelines/cold-calling')

  let synced = 0
  const webId = await getWebPipelineId()
  if (webId) {
    const webCards = await prisma.pipelineCard.findMany({
      where: { pipeline_id: webId, deleted_at: null },
      select: { entity_id: true, stage: true, notes: true },
    })
    for (const card of webCards) {
      if (!isReunionStageName(card.stage)) continue
      const contactId = parseInt(card.entity_id, 10)
      if (Number.isNaN(contactId)) continue
      const id = await syncContactToGlobalReunion({
        contactId,
        notes: card.notes,
        source: 'web',
      })
      if (id) synced++
    }
  }

  const coldId = await getColdCallPipelineId()
  if (coldId) {
    const coldCards = await prisma.pipelineCard.findMany({
      where: { pipeline_id: coldId, deleted_at: null, stage: 'REUNIÓN' },
      select: { entity_id: true },
    })
    for (const card of coldCards) {
      const prospectId = parseInt(card.entity_id, 10)
      if (Number.isNaN(prospectId)) continue
      const prospect = await prisma.coldCallProspect.findFirst({
        where: { id: prospectId, deleted_at: null },
        select: {
          id: true,
          nombre: true,
          empresa: true,
          telefono: true,
          email: true,
        },
      })
      if (!prospect) continue
      const id = await syncColdCallProspectToGlobalReunion(prospect)
      if (id) synced++
    }
  }

  return synced
}

/** Asegura contacto CRM a partir de un prospecto cold call y lo mete en REUNIÓN global. */
export async function syncColdCallProspectToGlobalReunion(prospect: {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
}): Promise<string | null> {
  let contact = null
  if (prospect.email) {
    contact = await prisma.contact.findFirst({
      where: { email: { equals: prospect.email, mode: 'insensitive' } },
    })
  }
  if (!contact && prospect.telefono) {
    contact = await prisma.contact.findFirst({ where: { telefono: prospect.telefono } })
  }

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        nombre: prospect.nombre,
        email: prospect.email || undefined,
        telefono: prospect.telefono || undefined,
        empresa: prospect.empresa || undefined,
      },
    })
  }

  let lead = await prisma.lead.findFirst({ where: { contact_id: contact.id } })
  if (!lead) {
    await prisma.lead.create({
      data: {
        contact_id: contact.id,
        estado: 'reunion',
        origen_principal: 'cold_calling',
        ultima_interaccion: new Date(),
      },
    })
  } else if (lead.estado !== 'reunion') {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { estado: 'reunion', ultima_interaccion: new Date() },
    })
  }

  const notes = [prospect.empresa, prospect.telefono, `Cold call #${prospect.id}`]
    .filter(Boolean)
    .join(' · ')

  return syncContactToGlobalReunion({
    contactId: contact.id,
    notes,
    source: 'coldcall',
  })
}
