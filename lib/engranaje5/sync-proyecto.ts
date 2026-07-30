import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { isValidConfiguradorConfig, mapConfigToProyecto, parseConfiguradorConfig } from './map-config'

export interface SyncProyectoInput {
  leadId: number
  configuracion?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
  leadEstado?: string | null
}

export interface SyncedProyecto {
  id: string
  name: string
  service_type: string
  status: string
  setup_fee_eur: number | null
  monthly_fee_eur: number | null
  config_ref: string | null
}

function numOrNull(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null
}

/**
 * Sincroniza configurador → proyectos con SQL directo.
 * Evita fallos de Prisma cuando faltan columnas nuevas en producción.
 */
export async function syncProyectoFromLead(input: SyncProyectoInput) {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    include: { contact: { select: { id: true, nombre: true, empresa: true } } },
  })

  if (!lead) {
    throw new Error('Lead no encontrado')
  }

  const configRaw = input.configuracion ?? lead.configuracion
  const cfg = parseConfiguradorConfig(configRaw)

  if (!isValidConfiguradorConfig(cfg)) {
    return { skipped: true as const, reason: 'Sin configuración válida' }
  }

  const payload = mapConfigToProyecto(cfg, {
    setupFee: input.setupFee ?? (lead.valor ? Number(lead.valor) : null),
    monthlyFee: input.monthlyFee ?? null,
    leadEstado: input.leadEstado ?? lead.estado,
    fallbackName: lead.contact?.empresa || lead.contact?.nombre || undefined,
  })

  const existing = await prisma.$queryRaw<{ id: string; client_id: string }[]>`
    SELECT id, client_id FROM proyectos WHERE lead_id = ${lead.id} LIMIT 1
  `

  let clientId = existing[0]?.client_id

  if (!clientId) {
    const sibling = lead.contact_id
      ? await prisma.$queryRaw<{ client_id: string }[]>`
          SELECT client_id FROM proyectos
          WHERE contact_id = ${lead.contact_id}
          LIMIT 1
        `
      : []
    clientId = sibling[0]?.client_id ?? randomUUID()
  }

  const setupFee = numOrNull(payload.setup_fee_eur)
  const monthlyFee = numOrNull(payload.monthly_fee_eur)

  if (existing[0]) {
    const rows = await prisma.$queryRaw<SyncedProyecto[]>`
      UPDATE proyectos SET
        client_id = ${clientId}::uuid,
        contact_id = ${lead.contact_id},
        config_ref = ${payload.config_ref},
        name = ${payload.name},
        service_type = ${payload.service_type},
        status = ${payload.status},
        addon_outbound = ${payload.addon_outbound},
        addon_crm_integration = ${payload.addon_crm_integration},
        addon_human_transfer = ${payload.addon_human_transfer},
        addon_email_summary = ${payload.addon_email_summary},
        addon_transcription = ${payload.addon_transcription},
        addon_cloned_voice = ${payload.addon_cloned_voice},
        addon_whatsapp = ${payload.addon_whatsapp},
        addon_web_widget = ${payload.addon_web_widget},
        addon_form_trigger = ${payload.addon_form_trigger},
        addon_multimodal = ${payload.addon_multimodal},
        addon_voice_in_chat = ${payload.addon_voice_in_chat},
        dashboard_tier = ${payload.dashboard_tier},
        languages_count = ${payload.languages_count},
        setup_fee_eur = ${setupFee},
        monthly_fee_eur = ${monthlyFee},
        has_mensualidad = ${payload.has_mensualidad},
        maint_plan = ${payload.maint_plan},
        has_voz = ${payload.has_voz},
        has_chat = ${payload.has_chat},
        has_dash = ${payload.has_dash},
        has_pack = ${payload.has_pack},
        updated_at = NOW()
      WHERE id = ${existing[0].id}::uuid
      RETURNING id, name, service_type, status, setup_fee_eur, monthly_fee_eur, config_ref
    `
    const proyecto = rows[0]
    if (!proyecto) throw new Error('No se pudo actualizar el proyecto')
    try {
      const { recomputeLeadCommercialValue } = await import('@/lib/crm/sync-lead-value')
      await recomputeLeadCommercialValue(lead.id)
    } catch (e) {
      console.error('[sync-proyecto] commercial value (update)', e)
    }
    return { skipped: false as const, proyecto }
  }

  const rows = await prisma.$queryRaw<SyncedProyecto[]>`
    INSERT INTO proyectos (
      client_id, lead_id, contact_id, config_ref, name, service_type, status,
      addon_outbound, addon_crm_integration, addon_human_transfer, addon_email_summary,
      addon_transcription, addon_cloned_voice, addon_whatsapp, addon_web_widget,
      addon_form_trigger, addon_multimodal, addon_voice_in_chat,
      dashboard_tier, languages_count, setup_fee_eur, monthly_fee_eur,
      has_mensualidad, maint_plan, has_voz, has_chat, has_dash, has_pack,
      es_buffalo, webhook_secret, created_at, updated_at
    ) VALUES (
      ${clientId}::uuid,
      ${lead.id},
      ${lead.contact_id},
      ${payload.config_ref},
      ${payload.name},
      ${payload.service_type},
      ${payload.status},
      ${payload.addon_outbound},
      ${payload.addon_crm_integration},
      ${payload.addon_human_transfer},
      ${payload.addon_email_summary},
      ${payload.addon_transcription},
      ${payload.addon_cloned_voice},
      ${payload.addon_whatsapp},
      ${payload.addon_web_widget},
      ${payload.addon_form_trigger},
      ${payload.addon_multimodal},
      ${payload.addon_voice_in_chat},
      ${payload.dashboard_tier},
      ${payload.languages_count},
      ${setupFee},
      ${monthlyFee},
      ${payload.has_mensualidad},
      ${payload.maint_plan},
      ${payload.has_voz},
      ${payload.has_chat},
      ${payload.has_dash},
      ${payload.has_pack},
      FALSE,
      gen_random_uuid()::TEXT,
      NOW(),
      NOW()
    )
    RETURNING id, name, service_type, status, setup_fee_eur, monthly_fee_eur, config_ref
  `

  const proyecto = rows[0]
  if (!proyecto) throw new Error('No se pudo crear el proyecto')

  // Nuevo proyecto → columna PROPUESTA CREADA del embudo global
  try {
    const { advanceLeadOnGlobalPipeline } = await import('@/lib/pipelines/onboarding-global')
    await advanceLeadOnGlobalPipeline(lead.id, 'crear_proyecto', {
      amount: setupFee,
    })
  } catch (e) {
    console.error('[sync-proyecto] pipeline PROPUESTA CREADA', e)
  }

  try {
    const { logCrmActivity } = await import('@/lib/crm/activities')
    await logCrmActivity({
      contactId: lead.contact_id,
      leadId: lead.id,
      kind: 'onboarding',
      title: 'Proyecto de onboarding creado',
      body: proyecto.name || null,
      meta: { proyecto_id: proyecto.id, service_type: proyecto.service_type },
    })
  } catch (e) {
    console.error('[sync-proyecto] crm activity', e)
  }

  try {
    const { recomputeLeadCommercialValue } = await import('@/lib/crm/sync-lead-value')
    await recomputeLeadCommercialValue(lead.id)
  } catch (e) {
    console.error('[sync-proyecto] commercial value', e)
  }

  return { skipped: false as const, proyecto, created: true as const }
}
