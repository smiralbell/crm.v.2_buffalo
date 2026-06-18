import { parseConfiguradorConfig } from './map-config'
import type { ProjectServiceFlags } from './data-column-guide'

export interface ProyectoRow {
  id: string
  name: string
  service_type: string
  status: string
  config_ref: string | null
  setup_fee_eur: number | null
  monthly_fee_eur: number | null
  maint_plan: string | null
  has_mensualidad: boolean
  has_voz?: boolean | null
  has_chat?: boolean | null
  has_dash?: boolean | null
  has_pack?: boolean | null
  launched_at: string | null
  lead_id: number | null
  contact_id: number | null
  dashboard_tier: string | null
  addon_outbound: boolean
  addon_transcription: boolean
  addon_cloned_voice: boolean
  addon_human_transfer: boolean
  addon_email_summary: boolean
  addon_whatsapp: boolean
  addon_web_widget: boolean
  addon_form_trigger: boolean
  addon_multimodal: boolean
  addon_crm_integration?: boolean
  addon_voice_in_chat?: boolean
  languages_count?: number | null
}

export function resolveProjectServices(
  row: ProyectoRow,
  configuracion?: string | null
): ProjectServiceFlags {
  const cfg = parseConfiguradorConfig(configuracion)

  const has_voz =
    row.has_voz != null ? row.has_voz : Boolean(cfg?.voz ?? row.service_type === 'voice_agent')
  const has_chat =
    row.has_chat != null ? row.has_chat : Boolean(cfg?.chat ?? row.service_type === 'text_agent')
  const has_dash =
    row.has_dash != null
      ? row.has_dash
      : Boolean(cfg?.dash ?? (row.service_type === 'dashboard_app' || row.dashboard_tier))
  const has_pack = row.has_pack != null ? row.has_pack : Boolean(cfg?.pack)

  return {
    has_voz: Boolean(has_voz),
    has_chat: Boolean(has_chat),
    has_dash: Boolean(has_dash),
    has_pack: Boolean(has_pack),
    addon_outbound: row.addon_outbound,
    addon_transcription: row.addon_transcription,
    addon_cloned_voice: row.addon_cloned_voice,
    addon_human_transfer: row.addon_human_transfer,
    addon_email_summary: row.addon_email_summary,
    addon_whatsapp: row.addon_whatsapp,
    addon_web_widget: row.addon_web_widget,
    addon_form_trigger: row.addon_form_trigger,
    addon_multimodal: row.addon_multimodal,
  }
}
