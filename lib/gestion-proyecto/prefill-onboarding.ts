import { buildProjectViewData } from '@/lib/onboarding/project-view'
import type { ProjectOnboarding } from './types'

type ProyectoContext = {
  name: string
  service_type: string
  status: string
  config_ref: string | null
  retell_agent_id: string | null
  twilio_number: string | null
  whatsapp_number: string | null
  dashboard_tier: string | null
  configuracion: string | null
}

const serviceLabel: Record<string, string> = {
  voice_agent: 'Agente de Voz',
  text_agent: 'Agente de Chat',
  dashboard_app: 'Dashboard',
  automation: 'Automatización',
  lead_gen: 'Generación de leads',
  geo_seo: 'GEO / SEO',
}

const statusLabel: Record<string, string> = {
  development: 'En desarrollo',
  active: 'Activo',
  paused: 'Pausado',
  churned: 'Baja',
}

/** Plantilla inicial sin datos comerciales ni PII del cliente (vista developer). */
export function buildDefaultOnboarding(
  projectId: string,
  ctx: ProyectoContext
): Omit<ProjectOnboarding, 'updated_at'> {
  const view = buildProjectViewData(ctx.configuracion, null, null)

  const stackLines = [
    `Servicio principal: ${serviceLabel[ctx.service_type] || ctx.service_type}`,
    view.services.length ? `Módulos: ${view.services.join(', ')}` : null,
    ctx.retell_agent_id ? `Retell agent ID: ${ctx.retell_agent_id}` : null,
    ctx.twilio_number ? `Twilio: ${ctx.twilio_number}` : null,
    ctx.whatsapp_number ? `WhatsApp: ${ctx.whatsapp_number}` : null,
    ctx.dashboard_tier ? `Dashboard tier: ${ctx.dashboard_tier}` : null,
    ctx.config_ref ? `Ref. interna: ${ctx.config_ref}` : null,
  ].filter(Boolean)

  return {
    project_id: projectId,
    summary: [
      `Proyecto: ${ctx.name}`,
      `Estado: ${statusLabel[ctx.status] || ctx.status}`,
    ].join('\n'),
    client_context: '',
    scope_text: [
      'Incluye (técnico):',
      ...(view.services.length ? view.services.map((s) => `• ${s}`) : ['• (completar alcance técnico)']),
      '',
      'No incluye:',
      '• Cambios fuera del alcance acordado sin nueva estimación',
    ].join('\n'),
    stack_text: stackLines.join('\n'),
    deliverables: [
      'Fase 1: Configuración inicial y accesos',
      'Fase 2: Desarrollo e integraciones',
      'Fase 3: Pruebas internas',
      'Fase 4: Lanzamiento y handoff',
    ].join('\n'),
    contacts: ['PM Buffalo: (completar)', 'Developer asignado: (completar)'].join('\n'),
    internal_notes: '',
  }
}
