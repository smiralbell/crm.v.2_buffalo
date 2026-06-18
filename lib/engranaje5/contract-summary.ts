import { parseConfiguradorConfig } from './map-config'
import { langLabel } from '@/lib/onboarding/project-view'
import type { ConfiguradorConfig } from './types'
import type { ProyectoRow } from './project-services'

export interface ContractSection {
  id: string
  title: string
  icon: 'voz' | 'chat' | 'dash' | 'pack' | 'maint'
  active: boolean
  items: string[]
}

export interface ContractSummary {
  sections: ContractSection[]
  setupTotal: number | null
  pay1: number | null
  pay2: number | null
  maintMonthly: number | null
  maintLabel: string | null
  hasMaint: boolean
  notas: string | null
  languagesCount: number | null
}

function pushIf(items: string[], cond: boolean | undefined, label: string) {
  if (cond) items.push(label)
}

function vozItems(cfg: ConfiguradorConfig | null, p: ProyectoRow): string[] {
  const items: string[] = []
  pushIf(items, cfg?.voz_outbound ?? p.addon_outbound, 'Llamadas salientes (outbound)')
  pushIf(items, cfg?.voz_crm ?? p.addon_crm_integration, 'Integración CRM')
  pushIf(items, cfg?.voz_transferir ?? p.addon_human_transfer, 'Transferencia a humano')
  pushIf(items, cfg?.voz_correo ?? p.addon_email_summary, 'Resumen por email tras llamada')
  pushIf(items, cfg?.voz_transcripcion ?? p.addon_transcription, 'Transcripción de llamadas')
  pushIf(items, cfg?.clonada ?? p.addon_cloned_voice, 'Voz clonada')
  const lang = cfg?.voz_lang
  if (lang != null) items.push(`Idiomas: ${langLabel(lang)}`)
  return items
}

function chatItems(cfg: ConfiguradorConfig | null, p: ProyectoRow): string[] {
  const items: string[] = []
  pushIf(items, cfg?.chat_whatsapp ?? p.addon_whatsapp, 'Canal WhatsApp')
  pushIf(items, cfg?.chat_widget ?? p.addon_web_widget, 'Widget web')
  pushIf(items, cfg?.chat_trigger ?? p.addon_form_trigger, 'Trigger por formulario')
  pushIf(items, cfg?.chat_crm ?? p.addon_crm_integration, 'Integración CRM')
  pushIf(items, cfg?.chat_multimodal ?? p.addon_multimodal, 'Multimodal (imagen / audio)')
  pushIf(items, cfg?.chat_audios ?? p.addon_voice_in_chat, 'Respuestas de audio en chat')
  const lang = cfg?.chat_lang
  if (lang != null) items.push(`Idiomas: ${langLabel(lang)}`)
  return items
}

function dashItems(cfg: ConfiguradorConfig | null, p: ProyectoRow): string[] {
  const tier = cfg?.dash_tier ?? p.dashboard_tier
  if (tier) return [`Tier: ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`]
  return []
}

function tierLabel(tier: string): string {
  const t = tier.toLowerCase()
  if (t.includes('avanzado')) return 'Avanzado'
  if (t.includes('completo')) return 'Completo'
  if (t.includes('basico') || t.includes('básico')) return 'Básico'
  return tier
}

export function buildContractSummary(
  proyecto: ProyectoRow,
  configuracion: string | null,
  opts: { valor?: number | null; notas?: string | null; languagesCount?: number | null } = {}
): ContractSummary {
  const cfg = parseConfiguradorConfig(configuracion)

  const hasVoz = cfg?.voz ?? proyecto.has_voz ?? proyecto.service_type === 'voice_agent'
  const hasChat = cfg?.chat ?? proyecto.has_chat ?? proyecto.service_type === 'text_agent'
  const hasDash = Boolean(
    cfg?.dash ?? proyecto.has_dash ?? (proyecto.service_type === 'dashboard_app' || !!proyecto.dashboard_tier)
  )
  const hasPack = cfg?.pack ?? proyecto.has_pack ?? false

  const sections: ContractSection[] = []

  if (hasPack) {
    sections.push({
      id: 'pack',
      title: 'Pack Voz + Chat',
      icon: 'pack',
      active: true,
      items: ['Descuento pack −10% sobre Voz + Chat combinados'],
    })
  }

  if (hasVoz) {
    const items = vozItems(cfg, proyecto)
    if (!items.length) items.push('Configuración base incluida')
    sections.push({
      id: 'voz',
      title: 'Agente de Voz',
      icon: 'voz',
      active: true,
      items,
    })
  }

  if (hasChat) {
    const items = chatItems(cfg, proyecto)
    if (!items.length) items.push('Configuración base incluida')
    sections.push({
      id: 'chat',
      title: 'Agente de Chat',
      icon: 'chat',
      active: true,
      items,
    })
  }

  if (hasDash) {
    const items = dashItems(cfg, proyecto)
    if (!items.length) items.push('Dashboard contratado')
    sections.push({
      id: 'dash',
      title: 'Dashboard / App',
      icon: 'dash',
      active: true,
      items: items.map((i) => (i.startsWith('Tier:') ? `Tier: ${tierLabel(i.replace('Tier: ', ''))}` : i)),
    })
  }

  const maintPlan = cfg?.maint ?? proyecto.maint_plan
  const hasMaint = Boolean(proyecto.has_mensualidad || maintPlan)
  const maintItems: string[] = []
  if (maintPlan === 'connect') maintItems.push('Buffalo Connect — 10% del setup/mes')
  else if (maintPlan === 'cloud') maintItems.push('Buffalo Cloud — 15% del setup/mes')
  else if (hasMaint) maintItems.push('Mantenimiento mensual contratado')

  if (hasMaint) {
    sections.push({
      id: 'maint',
      title: 'Mantenimiento',
      icon: 'maint',
      active: true,
      items: maintItems.length ? maintItems : ['Plan activo'],
    })
  }

  const setupTotal = opts.valor ?? proyecto.setup_fee_eur
  const pay1 = setupTotal != null ? Math.ceil(setupTotal / 2) : null
  const pay2 = setupTotal != null ? setupTotal - (pay1 ?? 0) : null

  let maintMonthly = proyecto.monthly_fee_eur
  let maintLabel: string | null = null
  if (maintPlan === 'connect') maintLabel = 'Buffalo Connect (10%)'
  else if (maintPlan === 'cloud') maintLabel = 'Buffalo Cloud (15%)'
  if (maintMonthly == null && setupTotal && maintPlan) {
    const pct = maintPlan === 'connect' ? 0.1 : 0.15
    maintMonthly = Math.round(setupTotal * pct)
  }

  return {
    sections,
    setupTotal,
    pay1,
    pay2,
    maintMonthly,
    maintLabel,
    hasMaint,
    notas: opts.notas ?? null,
    languagesCount: opts.languagesCount ?? null,
  }
}
