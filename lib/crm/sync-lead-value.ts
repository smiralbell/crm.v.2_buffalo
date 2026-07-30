import { prisma } from '@/lib/prisma'
import { getGlobalPipelineId } from '@/lib/pipelines/global-funnel'

export type LeadProjectFeeRow = {
  id: string
  setup_fee_eur: number | null
  monthly_fee_eur: number | null
}

/** Todos los proyectos vinculados a un lead (puede haber más de uno). */
export async function listProyectoFeesForLead(leadId: number): Promise<LeadProjectFeeRow[]> {
  try {
    return await prisma.$queryRawUnsafe<LeadProjectFeeRow[]>(
      `SELECT id::text AS id,
              setup_fee_eur::float8 AS setup_fee_eur,
              monthly_fee_eur::float8 AS monthly_fee_eur
       FROM proyectos
       WHERE lead_id = $1
       ORDER BY created_at ASC NULLS LAST, id ASC`,
      leadId
    )
  } catch {
    return []
  }
}

export async function sumSetupFeesForLead(leadId: number): Promise<{
  setupSum: number | null
  monthlySum: number | null
  count: number
  proyectos: LeadProjectFeeRow[]
}> {
  const proyectos = await listProyectoFeesForLead(leadId)
  if (proyectos.length === 0) {
    return { setupSum: null, monthlySum: null, count: 0, proyectos }
  }
  let setupSum = 0
  let monthlySum = 0
  let hasSetup = false
  let hasMonthly = false
  for (const p of proyectos) {
    if (p.setup_fee_eur != null && Number.isFinite(p.setup_fee_eur)) {
      setupSum += p.setup_fee_eur
      hasSetup = true
    }
    if (p.monthly_fee_eur != null && Number.isFinite(p.monthly_fee_eur)) {
      monthlySum += p.monthly_fee_eur
      hasMonthly = true
    }
  }
  return {
    setupSum: hasSetup ? setupSum : null,
    monthlySum: hasMonthly ? monthlySum : null,
    count: proyectos.length,
    proyectos,
  }
}

/** Actualiza amount de la tarjeta del pipeline global del contacto del lead. */
export async function syncPipelineAmountForLead(
  leadId: number,
  amount: number | null
): Promise<void> {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { contact_id: true },
    })
    if (!lead?.contact_id) return

    const pipelineId = await getGlobalPipelineId()
    const entityIds = [String(lead.contact_id), String(leadId)]

    if (pipelineId) {
      await prisma.pipelineCard.updateMany({
        where: {
          pipeline_id: pipelineId,
          entity_id: { in: entityIds },
          deleted_at: null,
        },
        data: { amount },
      })
    }

    // También otras tarjetas activas del mismo contacto (otros pipelines)
    await prisma.pipelineCard.updateMany({
      where: {
        entity_id: String(lead.contact_id),
        deleted_at: null,
        ...(pipelineId ? { NOT: { pipeline_id: pipelineId } } : {}),
      },
      data: { amount },
    })
  } catch (e) {
    console.error('[sync-lead-value] pipeline amount', e)
  }
}

/**
 * Recalcula lead.valor (= suma setup de proyectos si hay) y sincroniza pipeline.
 * Si no hay proyectos, deja lead.valor y solo empuja ese valor al pipeline.
 */
export async function recomputeLeadCommercialValue(leadId: number): Promise<number | null> {
  const { setupSum, count } = await sumSetupFeesForLead(leadId)
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { valor: true },
  })
  if (!lead) return null

  const nextValor =
    count > 0
      ? setupSum
      : lead.valor != null
        ? Number(lead.valor)
        : null

  if (count > 0) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { valor: nextValor },
    })
  }

  await syncPipelineAmountForLead(leadId, nextValor)
  return nextValor
}

/**
 * Aplica un setup comercial desde lead / pipeline / formulario único.
 * - 0 proyectos: escribe lead.valor + pipeline
 * - 1 proyecto: escribe setup (y opcional monthly) en ese proyecto + recompute
 * - N proyectos: escribe lead.valor + pipeline (los fees por proyecto se editan uno a uno;
 *   el total mostrado sigue siendo la suma tras cada edición de proyecto)
 */
export async function applyLeadSetupFee(
  leadId: number,
  setupFee: number | null,
  opts?: { monthlyFee?: number | null }
): Promise<{ valor: number | null; projectCount: number }> {
  const fee =
    setupFee != null && Number.isFinite(setupFee) ? setupFee : null
  const monthly =
    opts?.monthlyFee !== undefined
      ? opts.monthlyFee != null && Number.isFinite(opts.monthlyFee)
        ? opts.monthlyFee
        : null
      : undefined

  const { proyectos, count } = await sumSetupFeesForLead(leadId)

  if (count === 1 && proyectos[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE proyectos SET
         setup_fee_eur = $1,
         monthly_fee_eur = CASE WHEN $3::boolean THEN $2 ELSE monthly_fee_eur END,
         has_mensualidad = CASE
           WHEN $3::boolean THEN COALESCE($2, 0) > 0
           ELSE has_mensualidad
         END,
         updated_at = NOW()
       WHERE id = $4::uuid`,
      fee,
      monthly ?? null,
      monthly !== undefined,
      proyectos[0].id
    )
    const valor = await recomputeLeadCommercialValue(leadId)
    return { valor, projectCount: 1 }
  }

  if (count > 1 && proyectos[0]) {
    // Ajusta el primer proyecto para que la suma total coincida con el valor pedido
    const othersSum = proyectos.slice(1).reduce((s, p) => s + (p.setup_fee_eur || 0), 0)
    const firstSetup =
      fee == null ? null : Math.max(0, fee - othersSum)
    await prisma.$executeRawUnsafe(
      `UPDATE proyectos SET
         setup_fee_eur = $1,
         monthly_fee_eur = CASE WHEN $3::boolean THEN $2 ELSE monthly_fee_eur END,
         updated_at = NOW()
       WHERE id = $4::uuid`,
      firstSetup,
      monthly ?? null,
      monthly !== undefined,
      proyectos[0].id
    )
    const valor = await recomputeLeadCommercialValue(leadId)
    return { valor, projectCount: count }
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { valor: fee },
  })
  await syncPipelineAmountForLead(leadId, fee)
  return { valor: fee, projectCount: count }
}

/** Resuelve lead_id desde entity_id de una tarjeta de pipeline (contact id o lead id). */
export async function resolveLeadIdFromPipelineEntity(
  entityId: string
): Promise<number | null> {
  const n = parseInt(entityId, 10)
  if (!Number.isFinite(n) || n <= 0) return null

  const asLead = await prisma.lead.findUnique({
    where: { id: n },
    select: { id: true },
  })
  if (asLead) return asLead.id

  const fromContact = await prisma.lead.findFirst({
    where: { contact_id: n },
    select: { id: true },
    orderBy: { updated_at: 'desc' },
  })
  return fromContact?.id ?? null
}
