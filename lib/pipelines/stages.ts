import { prisma } from '@/lib/prisma'
import { DEFAULT_BUFFALO_STAGES, defaultStageColor } from './defaults'

export interface PipelineStageRow {
  id: string
  pipeline_id: string
  name: string
  color: string
  position: number
}

export function serializeStage(stage: {
  id: string
  pipeline_id: string
  name: string
  color: string
  position: number
}): PipelineStageRow {
  return {
    id: stage.id,
    pipeline_id: stage.pipeline_id,
    name: stage.name,
    color: stage.color,
    position: stage.position,
  }
}

/** Carga columnas del pipeline; si no existen, migra desde tarjetas + defaults Buffalo. */
export async function getPipelineStages(pipelineId: string): Promise<PipelineStageRow[]> {
  let stages = await prisma.pipelineStage.findMany({
    where: { pipeline_id: pipelineId },
    orderBy: { position: 'asc' },
  })

  if (stages.length === 0) {
    await seedStagesFromCards(pipelineId)
    stages = await prisma.pipelineStage.findMany({
      where: { pipeline_id: pipelineId },
      orderBy: { position: 'asc' },
    })
  } else {
    await syncOrphanCardStages(pipelineId, stages)
    stages = await prisma.pipelineStage.findMany({
      where: { pipeline_id: pipelineId },
      orderBy: { position: 'asc' },
    })
  }

  return stages.map(serializeStage)
}

async function seedStagesFromCards(pipelineId: string): Promise<void> {
  const cards = await prisma.pipelineCard.findMany({
    where: { pipeline_id: pipelineId, deleted_at: null },
    select: { stage: true, stage_color: true },
    orderBy: [{ stage: 'asc' }, { position: 'asc' }],
  })

  const cardStageNames = Array.from(new Set(cards.map((c) => c.stage)))
  const orderedNames = Array.from(
    new Set([...DEFAULT_BUFFALO_STAGES, ...cardStageNames])
  )

  const colorByStage = new Map<string, string>()
  for (const card of cards) {
    if (!colorByStage.has(card.stage) && card.stage_color) {
      colorByStage.set(card.stage, card.stage_color)
    }
  }

  await prisma.pipelineStage.createMany({
    data: orderedNames.map((name, index) => ({
      pipeline_id: pipelineId,
      name,
      color: colorByStage.get(name) || defaultStageColor(name),
      position: index,
    })),
    skipDuplicates: true,
  })
}

async function syncOrphanCardStages(
  pipelineId: string,
  existing: { name: string; position: number }[]
): Promise<void> {
  const known = new Set(existing.map((s) => s.name))
  const orphans = await prisma.pipelineCard.findMany({
    where: { pipeline_id: pipelineId, deleted_at: null },
    select: { stage: true, stage_color: true },
    distinct: ['stage'],
  })

  const missing = orphans.filter((o) => !known.has(o.stage))
  if (missing.length === 0) return

  let nextPosition =
    existing.reduce((max, s) => Math.max(max, s.position), -1) + 1

  for (const row of missing) {
    await prisma.pipelineStage.create({
      data: {
        pipeline_id: pipelineId,
        name: row.stage,
        color: row.stage_color || defaultStageColor(row.stage),
        position: nextPosition++,
      },
    })
  }
}

export async function seedDefaultStagesForPipeline(pipelineId: string): Promise<void> {
  const count = await prisma.pipelineStage.count({ where: { pipeline_id: pipelineId } })
  if (count > 0) return

  await prisma.pipelineStage.createMany({
    data: DEFAULT_BUFFALO_STAGES.map((name, index) => ({
      pipeline_id: pipelineId,
      name,
      color: defaultStageColor(name),
      position: index,
    })),
  })
}

export async function createPipelineStage(
  pipelineId: string,
  name: string,
  color: string,
  insertAt?: number
): Promise<PipelineStageRow> {
  const stages = await getPipelineStages(pipelineId)
  const trimmed = name.trim()
  if (!trimmed) throw new Error('El nombre de la columna es obligatorio')
  if (stages.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Ya existe una columna con ese nombre')
  }

  const position =
    insertAt == null || insertAt < 0 || insertAt > stages.length
      ? stages.length
      : insertAt

  await prisma.$transaction(async (tx) => {
    await tx.pipelineStage.updateMany({
      where: {
        pipeline_id: pipelineId,
        position: { gte: position },
      },
      data: { position: { increment: 1 } },
    })

    await tx.pipelineStage.create({
      data: {
        pipeline_id: pipelineId,
        name: trimmed,
        color,
        position,
      },
    })
  })

  const created = await prisma.pipelineStage.findFirst({
    where: { pipeline_id: pipelineId, name: trimmed },
  })
  if (!created) throw new Error('No se pudo crear la columna')
  return serializeStage(created)
}

export async function updatePipelineStage(
  pipelineId: string,
  oldName: string,
  newName: string,
  newColor: string
): Promise<void> {
  const trimmedNew = newName.trim()
  if (!trimmedNew) throw new Error('El nombre de la columna es obligatorio')

  const stage = await prisma.pipelineStage.findFirst({
    where: { pipeline_id: pipelineId, name: oldName },
  })
  if (!stage) throw new Error('Columna no encontrada')

  if (trimmedNew !== oldName) {
    const duplicate = await prisma.pipelineStage.findFirst({
      where: { pipeline_id: pipelineId, name: trimmedNew },
    })
    if (duplicate) throw new Error('Ya existe una columna con ese nombre')
  }

  await prisma.$transaction([
    prisma.pipelineStage.update({
      where: { id: stage.id },
      data: { name: trimmedNew, color: newColor },
    }),
    prisma.pipelineCard.updateMany({
      where: { pipeline_id: pipelineId, stage: oldName, deleted_at: null },
      data: { stage: trimmedNew },
    }),
  ])
}

export async function deletePipelineStage(pipelineId: string, stageName: string): Promise<void> {
  const cardCount = await prisma.pipelineCard.count({
    where: { pipeline_id: pipelineId, stage: stageName, deleted_at: null },
  })
  if (cardCount > 0) {
    throw new Error('No se puede eliminar una columna con tarjetas')
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: { pipeline_id: pipelineId, name: stageName },
  })
  if (!stage) return

  await prisma.$transaction(async (tx) => {
    await tx.pipelineStage.delete({ where: { id: stage.id } })
    const remaining = await tx.pipelineStage.findMany({
      where: { pipeline_id: pipelineId },
      orderBy: { position: 'asc' },
    })
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await tx.pipelineStage.update({
          where: { id: remaining[i].id },
          data: { position: i },
        })
      }
    }
  })
}

export async function reorderPipelineStages(
  pipelineId: string,
  orderedStageIds: string[]
): Promise<PipelineStageRow[]> {
  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline_id: pipelineId },
  })

  if (orderedStageIds.length !== stages.length) {
    throw new Error('Lista de columnas incompleta')
  }

  const idSet = new Set(stages.map((s) => s.id))
  for (const id of orderedStageIds) {
    if (!idSet.has(id)) throw new Error('Columna no válida')
  }

  await prisma.$transaction(
    orderedStageIds.map((id, position) =>
      prisma.pipelineStage.update({
        where: { id },
        data: { position },
      })
    )
  )

  return getPipelineStages(pipelineId)
}

export async function movePipelineStage(
  pipelineId: string,
  stageName: string,
  direction: 'left' | 'right'
): Promise<PipelineStageRow[]> {
  const stages = await getPipelineStages(pipelineId)
  const index = stages.findIndex((s) => s.name === stageName)
  if (index === -1) throw new Error('Columna no encontrada')

  const targetIndex = direction === 'left' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= stages.length) {
    return stages
  }

  const reordered = [...stages]
  const [moved] = reordered.splice(index, 1)
  reordered.splice(targetIndex, 0, moved)

  return reorderPipelineStages(
    pipelineId,
    reordered.map((s) => s.id)
  )
}

export function getStageColor(stages: PipelineStageRow[], stageName: string): string {
  return stages.find((s) => s.name === stageName)?.color || defaultStageColor(stageName)
}
