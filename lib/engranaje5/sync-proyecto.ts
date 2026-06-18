import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { mapConfigToProyecto, parseConfiguradorConfig } from './map-config'

export interface SyncProyectoInput {
  leadId: number
  configuracion?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
  leadEstado?: string | null
}

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

  if (!cfg) {
    return { skipped: true as const, reason: 'Sin configuración válida' }
  }

  const payload = mapConfigToProyecto(cfg, {
    setupFee: input.setupFee ?? (lead.valor ? Number(lead.valor) : null),
    monthlyFee: input.monthlyFee ?? null,
    leadEstado: input.leadEstado ?? lead.estado,
    fallbackName: lead.contact?.empresa || lead.contact?.nombre || undefined,
  })

  const existing = await prisma.proyecto.findUnique({
    where: { lead_id: lead.id },
  })

  let clientId = existing?.client_id

  if (!clientId) {
    const sibling = lead.contact_id
      ? await prisma.proyecto.findFirst({
          where: { contact_id: lead.contact_id },
          select: { client_id: true },
        })
      : null
    clientId = sibling?.client_id ?? randomUUID()
  }

  const data = {
    client_id: clientId,
    lead_id: lead.id,
    contact_id: lead.contact_id,
    config_ref: payload.config_ref,
    name: payload.name,
    service_type: payload.service_type,
    status: payload.status,
    addon_outbound: payload.addon_outbound,
    addon_crm_integration: payload.addon_crm_integration,
    addon_human_transfer: payload.addon_human_transfer,
    addon_email_summary: payload.addon_email_summary,
    addon_transcription: payload.addon_transcription,
    addon_cloned_voice: payload.addon_cloned_voice,
    addon_whatsapp: payload.addon_whatsapp,
    addon_web_widget: payload.addon_web_widget,
    addon_form_trigger: payload.addon_form_trigger,
    addon_multimodal: payload.addon_multimodal,
    addon_voice_in_chat: payload.addon_voice_in_chat,
    dashboard_tier: payload.dashboard_tier,
    languages_count: payload.languages_count,
    setup_fee_eur: payload.setup_fee_eur,
    monthly_fee_eur: payload.monthly_fee_eur,
    has_mensualidad: payload.has_mensualidad,
    maint_plan: payload.maint_plan,
    has_voz: payload.has_voz,
    has_chat: payload.has_chat,
    has_dash: payload.has_dash,
    has_pack: payload.has_pack,
  }

  const proyecto = existing
    ? await prisma.proyecto.update({ where: { id: existing.id }, data })
    : await prisma.proyecto.create({ data })

  return { skipped: false as const, proyecto }
}
