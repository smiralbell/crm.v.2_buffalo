import { prisma } from '@/lib/prisma'
import type { ColdCallScope } from '@/lib/coldcall/scope'
import { getScopeFilterParams } from '@/lib/coldcall/scope'
import { syncColdCallProspectToGlobalReunion } from '@/lib/pipelines/global-funnel'

export const COLDCALL_PIPELINE_NAME = 'Cold Calling'
export const COLDCALL_TAG = 'coldcall'

export const COLDCALL_STAGES = [
  'LEAD',
  '1 LLAMADA NO CONTESTADA',
  '2 LLAMADA NO CONTESTADA',
  'LLAMAR MAS TARDE',
  'INTERESADO',
  'REUNIÓN',
  'NO INTERESADO',
] as const

export type ColdCallPipelineStage = (typeof COLDCALL_STAGES)[number]

export const COLDCALL_STAGE_COLORS: Record<ColdCallPipelineStage, string> = {
  LEAD: '#6B7280',
  '1 LLAMADA NO CONTESTADA': '#F59E0B',
  '2 LLAMADA NO CONTESTADA': '#F97316',
  'LLAMAR MAS TARDE': '#EAB308',
  INTERESADO: '#10B981',
  REUNIÓN: '#8B5CF6',
  'NO INTERESADO': '#EF4444',
}

let cachedPipelineId: string | null | undefined

export async function getColdCallPipelineId(): Promise<string | null> {
  if (process.env.COLDCALL_PIPELINE_ID) return process.env.COLDCALL_PIPELINE_ID
  if (cachedPipelineId !== undefined) return cachedPipelineId

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM pipelines
    WHERE LOWER(name) = LOWER(${COLDCALL_PIPELINE_NAME})
    LIMIT 1
  `
  cachedPipelineId = rows[0]?.id ?? null
  return cachedPipelineId
}

export async function isColdCallPipeline(pipelineId: string): Promise<boolean> {
  const coldId = await getColdCallPipelineId()
  return coldId === pipelineId
}

export function resolvePipelineStageFromOutcome(
  outcome: string,
  callAttempts: number
): ColdCallPipelineStage {
  switch (outcome) {
    case 'sin_respuesta':
    case 'buzon_voz':
      if (callAttempts >= 3) return 'NO INTERESADO'
      if (callAttempts === 2) return '2 LLAMADA NO CONTESTADA'
      if (callAttempts === 1) return '1 LLAMADA NO CONTESTADA'
      return 'LEAD'
    case 'llamar_tarde':
      return 'LLAMAR MAS TARDE'
    case 'interesado':
      return 'INTERESADO'
    case 'reunion_agendada':
      return 'REUNIÓN'
    case 'no_interesado':
    case 'otra_persona':
    case 'no_contactar':
      return 'NO INTERESADO'
    default:
      return 'LEAD'
  }
}

export function resolvePipelineStageFromProspect(prospect: {
  stage: string
  call_attempts: number
}): ColdCallPipelineStage {
  switch (prospect.stage) {
    case 'reunion_agendada':
      return 'REUNIÓN'
    case 'volver_a_llamar':
      return 'LLAMAR MAS TARDE'
    case 'interesado_info_enviada':
      return 'INTERESADO'
    case 'no_interesado':
      return 'NO INTERESADO'
    default:
      break
  }

  if (prospect.call_attempts >= 3) return 'NO INTERESADO'
  if (prospect.call_attempts === 2) return '2 LLAMADA NO CONTESTADA'
  if (prospect.call_attempts === 1) return '1 LLAMADA NO CONTESTADA'
  return 'LEAD'
}

export async function ensureColdCallPipelineStages(pipelineId: string): Promise<void> {
  // Evitar crash si el Prisma Client en memoria está desfasado tras un generate
  if (!prisma.pipelineStage?.findMany) {
    console.warn(
      '[cold-calling] prisma.pipelineStage no disponible; reinicia el servidor (npm run dev)'
    )
    return
  }

  const existing = await prisma.pipelineStage.findMany({
    where: { pipeline_id: pipelineId },
    select: { name: true, position: true },
    orderBy: { position: 'asc' },
  })
  const known = new Set(existing.map((s) => s.name))
  let nextPosition = existing.reduce((max, s) => Math.max(max, s.position), -1) + 1

  for (const name of COLDCALL_STAGES) {
    if (known.has(name)) continue
    await prisma.pipelineStage.create({
      data: {
        pipeline_id: pipelineId,
        name,
        color: COLDCALL_STAGE_COLORS[name],
        position: nextPosition++,
      },
    })
  }
}

interface ProspectRow {
  id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  notas: string | null
  stage: string
  call_attempts: number
  assigned_user_id: number | null
  campaign_id: number | null
  synced_to_crm_as: string | null
}

function buildPipelineCardNotes(prospect: {
  empresa: string | null
  telefono: string | null
  notas: string | null
}): string | null {
  const meta = [prospect.empresa, prospect.telefono].filter(Boolean).join(' · ')
  const note = prospect.notas?.trim() || ''
  if (meta && note) return `${meta}\n\n${note}`
  return note || meta || null
}

async function latestCallNote(prospectId: number): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ notas: string | null }[]>`
    SELECT notas
    FROM coldcall_calls
    WHERE prospect_id = ${prospectId}
      AND notas IS NOT NULL
      AND TRIM(notas) <> ''
    ORDER BY fecha DESC
    LIMIT 1
  `
  return rows[0]?.notas?.trim() || null
}

async function loadProspect(prospectId: number): Promise<ProspectRow | null> {
  const rows = await prisma.$queryRaw<ProspectRow[]>`
    SELECT
      p.id,
      p.nombre,
      p.empresa,
      p.telefono,
      p.email,
      p.notas,
      p.stage,
      p.call_attempts,
      p.assigned_user_id,
      p.campaign_id,
      p.synced_to_crm_as
    FROM coldcall_prospects p
    WHERE p.id = ${prospectId} AND p.deleted_at IS NULL
    LIMIT 1
  `
  return rows[0] ?? null
}

async function findCardForProspect(pipelineId: string, prospectId: number) {
  const entityId = String(prospectId)
  return prisma.pipelineCard.findFirst({
    where: {
      pipeline_id: pipelineId,
      entity_id: entityId,
      deleted_at: null,
      tags: { has: COLDCALL_TAG },
    },
  })
}

async function nextCardPosition(pipelineId: string, stage: string): Promise<number> {
  const last = await prisma.pipelineCard.findFirst({
    where: { pipeline_id: pipelineId, stage, deleted_at: null },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  return last ? last.position + 1 : 0
}

export async function syncProspectPipelineCard(
  prospectId: number,
  opts?: { outcome?: string; callAttempts?: number }
): Promise<string | null> {
  const pipelineId = await getColdCallPipelineId()
  if (!pipelineId) return null

  const prospect = await loadProspect(prospectId)
  if (!prospect) return null

  await ensureColdCallPipelineStages(pipelineId)

  if (!prospect.notas?.trim()) {
    const fromCall = await latestCallNote(prospectId)
    if (fromCall) {
      prospect.notas = fromCall
      await prisma.$executeRaw`
        UPDATE coldcall_prospects
        SET notas = ${fromCall}, updated_at = NOW()
        WHERE id = ${prospectId} AND (notas IS NULL OR TRIM(notas) = '')
      `
    }
  }

  const stage =
    opts?.outcome != null
      ? resolvePipelineStageFromOutcome(opts.outcome, opts.callAttempts ?? prospect.call_attempts)
      : resolvePipelineStageFromProspect(prospect)

  const stageColor = COLDCALL_STAGE_COLORS[stage]
  const entityId = String(prospectId)
  const existing = await findCardForProspect(pipelineId, prospectId)

  const cardNotes = buildPipelineCardNotes(prospect)

  if (existing) {
    const position =
      existing.stage === stage ? existing.position : await nextCardPosition(pipelineId, stage)

    await prisma.pipelineCard.update({
      where: { id: existing.id },
      data: {
        stage,
        stage_color: stageColor,
        position,
        notes: cardNotes,
      },
    })

    if (prospect.synced_to_crm_as !== existing.id) {
      await prisma.$executeRaw`
        UPDATE coldcall_prospects SET synced_to_crm_as = ${existing.id}, updated_at = NOW()
        WHERE id = ${prospectId}
      `
    }

    if (stage === 'REUNIÓN') {
      void syncColdCallProspectToGlobalReunion(prospect).catch((err) =>
        console.error('[coldcall] global reunion sync', err)
      )
    }

    return existing.id
  }

  const position = await nextCardPosition(pipelineId, stage)
  const card = await prisma.pipelineCard.create({
    data: {
      pipeline_id: pipelineId,
      entity_id: entityId,
      entity_type: 'contact',
      stage,
      stage_color: stageColor,
      position,
      tags: [COLDCALL_TAG],
      notes: cardNotes,
    },
  })

  await prisma.$executeRaw`
    UPDATE coldcall_prospects SET synced_to_crm_as = ${card.id}, updated_at = NOW()
    WHERE id = ${prospectId}
  `

  if (stage === 'REUNIÓN') {
    void syncColdCallProspectToGlobalReunion(prospect).catch((err) =>
      console.error('[coldcall] global reunion sync', err)
    )
  }

  return card.id
}

export async function deleteProspectPipelineCard(prospectId: number): Promise<void> {
  const pipelineId = await getColdCallPipelineId()
  if (!pipelineId) return

  const card = await findCardForProspect(pipelineId, prospectId)
  if (!card) return

  await prisma.pipelineCard.update({
    where: { id: card.id },
    data: { deleted_at: new Date() },
  })
}

export async function getProspectIdsInScope(scope: ColdCallScope): Promise<number[]> {
  const { userId, teamIds, legacyAdmin } = getScopeFilterParams(scope)

  if (legacyAdmin) {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT p.id FROM coldcall_prospects p WHERE p.deleted_at IS NULL
    `
    return rows.map((r) => r.id)
  }

  if (userId != null) {
    const rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT p.id
      FROM coldcall_prospects p
      LEFT JOIN coldcall_campaigns c ON c.id = p.campaign_id
      WHERE p.deleted_at IS NULL
        AND COALESCE(p.assigned_user_id, c.assigned_to_user_id, c.created_by_user_id) = ${userId}
    `
    return rows.map((r) => r.id)
  }

  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT p.id
    FROM coldcall_prospects p
    LEFT JOIN coldcall_campaigns c ON c.id = p.campaign_id
    WHERE p.deleted_at IS NULL
      AND (
        COALESCE(p.assigned_user_id, c.assigned_to_user_id) = ANY(${teamIds}::int[])
        OR c.created_by_user_id = ANY(${teamIds}::int[])
        OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
      )
  `
  return rows.map((r) => r.id)
}

/** Crea tarjetas faltantes y actualiza columnas según el estado actual del prospecto. */
export async function syncColdCallPipelineForScope(scope: ColdCallScope): Promise<number> {
  const pipelineId = await getColdCallPipelineId()
  if (!pipelineId) return 0

  const ids = await getProspectIdsInScope(scope)
  for (const id of ids) {
    await syncProspectPipelineCard(id)
  }
  return ids.length
}

export async function backfillMissingColdCallCards(scope: ColdCallScope): Promise<number> {
  const pipelineId = await getColdCallPipelineId()
  if (!pipelineId) return 0

  const { userId, teamIds, legacyAdmin } = getScopeFilterParams(scope)

  let rows: { id: number }[]

  if (legacyAdmin) {
    rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT p.id
      FROM coldcall_prospects p
      LEFT JOIN pipeline_cards pc ON pc.entity_id = p.id::text
        AND pc.pipeline_id = ${pipelineId}::uuid
        AND pc.deleted_at IS NULL
        AND ${COLDCALL_TAG} = ANY(pc.tags)
      WHERE p.deleted_at IS NULL AND pc.id IS NULL
    `
  } else if (userId != null) {
    rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT p.id
      FROM coldcall_prospects p
      LEFT JOIN coldcall_campaigns c ON c.id = p.campaign_id
      LEFT JOIN pipeline_cards pc ON pc.entity_id = p.id::text
        AND pc.pipeline_id = ${pipelineId}::uuid
        AND pc.deleted_at IS NULL
        AND ${COLDCALL_TAG} = ANY(pc.tags)
      WHERE p.deleted_at IS NULL
        AND pc.id IS NULL
        AND COALESCE(p.assigned_user_id, c.assigned_to_user_id, c.created_by_user_id) = ${userId}
    `
  } else {
    rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT p.id
      FROM coldcall_prospects p
      LEFT JOIN coldcall_campaigns c ON c.id = p.campaign_id
      LEFT JOIN pipeline_cards pc ON pc.entity_id = p.id::text
        AND pc.pipeline_id = ${pipelineId}::uuid
        AND pc.deleted_at IS NULL
        AND ${COLDCALL_TAG} = ANY(pc.tags)
      WHERE p.deleted_at IS NULL
        AND pc.id IS NULL
        AND (
          COALESCE(p.assigned_user_id, c.assigned_to_user_id) = ANY(${teamIds}::int[])
          OR c.created_by_user_id = ANY(${teamIds}::int[])
          OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
        )
    `
  }

  for (const row of rows) {
    await syncProspectPipelineCard(row.id)
  }

  return rows.length
}

export async function getColdCallPipelineCards(scope: ColdCallScope, pipelineId: string) {
  const { userId, teamIds, legacyAdmin } = getScopeFilterParams(scope)

  if (legacyAdmin) {
    return prisma.$queryRaw<
      {
        id: string
        entity_id: string
        entity_type: string
        stage: string
        stage_color: string | null
        position: number
        tags: string[]
        capture_date: Date | null
        amount: unknown
        notes: string | null
        created_at: Date
        updated_at: Date
      }[]
    >`
      SELECT pc.id, pc.entity_id, pc.entity_type, pc.stage, pc.stage_color, pc.position,
             pc.tags, pc.capture_date, pc.amount, pc.notes, pc.created_at, pc.updated_at
      FROM pipeline_cards pc
      INNER JOIN coldcall_prospects p ON p.id = pc.entity_id::int AND p.deleted_at IS NULL
      WHERE pc.pipeline_id = ${pipelineId}::uuid
        AND pc.deleted_at IS NULL
        AND ${COLDCALL_TAG} = ANY(pc.tags)
      ORDER BY pc.stage ASC, pc.position ASC
    `
  }

  if (userId != null) {
    return prisma.$queryRaw<
      {
        id: string
        entity_id: string
        entity_type: string
        stage: string
        stage_color: string | null
        position: number
        tags: string[]
        capture_date: Date | null
        amount: unknown
        notes: string | null
        created_at: Date
        updated_at: Date
      }[]
    >`
      SELECT pc.id, pc.entity_id, pc.entity_type, pc.stage, pc.stage_color, pc.position,
             pc.tags, pc.capture_date, pc.amount, pc.notes, pc.created_at, pc.updated_at
      FROM pipeline_cards pc
      INNER JOIN coldcall_prospects p ON p.id = pc.entity_id::int AND p.deleted_at IS NULL
      LEFT JOIN coldcall_campaigns c ON c.id = p.campaign_id
      WHERE pc.pipeline_id = ${pipelineId}::uuid
        AND pc.deleted_at IS NULL
        AND ${COLDCALL_TAG} = ANY(pc.tags)
        AND COALESCE(p.assigned_user_id, c.assigned_to_user_id, c.created_by_user_id) = ${userId}
      ORDER BY pc.stage ASC, pc.position ASC
    `
  }

  return prisma.$queryRaw<
    {
      id: string
      entity_id: string
      entity_type: string
      stage: string
      stage_color: string | null
      position: number
      tags: string[]
      capture_date: Date | null
      amount: unknown
      notes: string | null
      created_at: Date
      updated_at: Date
    }[]
  >`
    SELECT pc.id, pc.entity_id, pc.entity_type, pc.stage, pc.stage_color, pc.position,
           pc.tags, pc.capture_date, pc.amount, pc.notes, pc.created_at, pc.updated_at
    FROM pipeline_cards pc
    INNER JOIN coldcall_prospects p ON p.id = pc.entity_id::int AND p.deleted_at IS NULL
    LEFT JOIN coldcall_campaigns c ON c.id = p.campaign_id
    WHERE pc.pipeline_id = ${pipelineId}::uuid
      AND pc.deleted_at IS NULL
      AND ${COLDCALL_TAG} = ANY(pc.tags)
      AND (
        COALESCE(p.assigned_user_id, c.assigned_to_user_id) = ANY(${teamIds}::int[])
        OR c.created_by_user_id = ANY(${teamIds}::int[])
        OR (c.assigned_to_user_id IS NULL AND c.created_by_user_id IS NULL)
      )
    ORDER BY pc.stage ASC, pc.position ASC
  `
}

export async function getColdCallProspectDisplayMap(
  entityIds: string[]
): Promise<
  Record<
    string,
    {
      nombre: string
      email: string | null
      telefono: string | null
      notas: string | null
      campaign_id: number | null
    }
  >
> {
  const ids = entityIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
  if (ids.length === 0) return {}

  const rows = await prisma.$queryRaw<
    {
      id: number
      nombre: string
      email: string | null
      telefono: string | null
      notas: string | null
      campaign_id: number | null
    }[]
  >`
    SELECT id, nombre, email, telefono, notas, campaign_id
    FROM coldcall_prospects
    WHERE id = ANY(${ids}::int[]) AND deleted_at IS NULL
  `

  const map: Record<
    string,
    {
      nombre: string
      email: string | null
      telefono: string | null
      notas: string | null
      campaign_id: number | null
    }
  > = {}
  for (const row of rows) {
    map[String(row.id)] = {
      nombre: row.nombre,
      email: row.email,
      telefono: row.telefono,
      notas: row.notas,
      campaign_id: row.campaign_id,
    }
  }
  return map
}
