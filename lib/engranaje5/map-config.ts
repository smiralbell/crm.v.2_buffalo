import type {
  ConfiguradorConfig,
  DashboardTier,
  ProyectoServiceType,
  ProyectoStatus,
} from './types'

function langPriceToCount(price?: number): number {
  if (price === 700) return 5
  if (price === 400) return 3
  return 1
}

function mapDashTier(tier?: string | null): DashboardTier | null {
  if (!tier) return null
  const t = tier.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (t.includes('avanzado')) return 'avanzado'
  if (t.includes('completo')) return 'completo'
  if (t.includes('basico') || t.includes('básico')) return 'basico'
  return null
}

function resolveServiceType(cfg: ConfiguradorConfig): ProyectoServiceType {
  if (cfg.mode === 'custom' && cfg.service_type) return cfg.service_type
  if (cfg.voz) return 'voice_agent'
  if (cfg.chat) return 'text_agent'
  if (cfg.dash) return 'dashboard_app'
  if (cfg.mode === 'custom') return 'automation'
  return 'voice_agent'
}

function resolveStatus(leadEstado?: string | null): ProyectoStatus {
  const e = (leadEstado || '').toLowerCase()
  if (e === 'activo' || e === 'cerrado') return 'active'
  if (e === 'perdido') return 'churned'
  return 'development'
}

function resolveLanguagesCount(cfg: ConfiguradorConfig): number {
  const counts: number[] = []
  if (cfg.voz) counts.push(langPriceToCount(cfg.voz_lang))
  if (cfg.chat) counts.push(langPriceToCount(cfg.chat_lang))
  return counts.length ? Math.max(...counts) : 1
}

export interface ProyectoUpsertPayload {
  name: string
  service_type: ProyectoServiceType
  status: ProyectoStatus
  config_ref: string | null
  addon_outbound: boolean
  addon_crm_integration: boolean
  addon_human_transfer: boolean
  addon_email_summary: boolean
  addon_transcription: boolean
  addon_cloned_voice: boolean
  addon_whatsapp: boolean
  addon_web_widget: boolean
  addon_form_trigger: boolean
  addon_multimodal: boolean
  addon_voice_in_chat: boolean
  dashboard_tier: DashboardTier | null
  languages_count: number
  setup_fee_eur: number | null
  monthly_fee_eur: number | null
  has_mensualidad: boolean
  maint_plan: string | null
  has_voz: boolean
  has_chat: boolean
  has_dash: boolean
  has_pack: boolean
}

export function mapConfigToProyecto(
  cfg: ConfiguradorConfig,
  opts: {
    setupFee?: number | null
    monthlyFee?: number | null
    leadEstado?: string | null
    fallbackName?: string
  } = {}
): ProyectoUpsertPayload {
  const isCustom = cfg.mode === 'custom'
  const name =
    (isCustom ? cfg.title?.trim() : '') ||
    cfg.empresa?.trim() ||
    cfg.nombre?.trim() ||
    opts.fallbackName?.trim() ||
    cfg.ref?.trim() ||
    'Proyecto Buffalo'

  const setupFromConfig =
    cfg.setup_total_eur != null && Number.isFinite(cfg.setup_total_eur)
      ? Number(cfg.setup_total_eur)
      : null
  const monthlyFromConfig =
    cfg.monthly_fee_eur != null && Number.isFinite(Number(cfg.monthly_fee_eur))
      ? Number(cfg.monthly_fee_eur)
      : null

  return {
    name,
    service_type: resolveServiceType(cfg),
    status: resolveStatus(opts.leadEstado),
    config_ref: cfg.ref?.trim() || null,
    addon_outbound: Boolean(cfg.voz_outbound),
    addon_crm_integration: Boolean(cfg.voz_crm || cfg.chat_crm),
    addon_human_transfer: Boolean(cfg.voz_transferir),
    addon_email_summary: Boolean(cfg.voz_correo),
    addon_transcription: Boolean(cfg.voz_transcripcion),
    addon_cloned_voice: Boolean(cfg.clonada),
    addon_whatsapp: Boolean(cfg.chat_whatsapp),
    addon_web_widget: Boolean(cfg.chat_widget),
    addon_form_trigger: Boolean(cfg.chat_trigger),
    addon_multimodal: Boolean(cfg.chat_multimodal),
    addon_voice_in_chat: Boolean(cfg.chat_audios),
    dashboard_tier: cfg.dash ? mapDashTier(cfg.dash_tier) : null,
    languages_count: resolveLanguagesCount(cfg),
    setup_fee_eur: opts.setupFee ?? setupFromConfig,
    monthly_fee_eur: isCustom
      ? opts.monthlyFee ?? monthlyFromConfig
      : cfg.maint
        ? opts.monthlyFee ?? null
        : null,
    has_mensualidad: isCustom
      ? Boolean(monthlyFromConfig || opts.monthlyFee)
      : Boolean(cfg.maint),
    maint_plan: isCustom ? (monthlyFromConfig || opts.monthlyFee ? 'custom' : null) : cfg.maint ?? null,
    has_voz: Boolean(cfg.voz),
    has_chat: Boolean(cfg.chat),
    has_dash: Boolean(cfg.dash),
    has_pack: Boolean(cfg.pack),
  }
}

export function isValidConfiguradorConfig(cfg: ConfiguradorConfig | null): boolean {
  if (!cfg) return false
  if (cfg.mode === 'custom') {
    return Boolean(
      (cfg.title || cfg.empresa || cfg.nombre) &&
        (cfg.setup_total_eur || (cfg.line_items && cfg.line_items.length > 0))
    )
  }
  return Boolean(cfg.voz || cfg.chat || cfg.dash)
}

export function parseConfiguradorConfig(raw?: string | null): ConfiguradorConfig | null {
  if (!raw) return null
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8')
    return JSON.parse(json) as ConfiguradorConfig
  } catch {
    try {
      return JSON.parse(raw) as ConfiguradorConfig
    } catch {
      return null
    }
  }
}
