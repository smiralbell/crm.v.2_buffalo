/**
 * Subagentes por módulo del CRM. Cada uno es un agente LLM con su propio
 * prompt, las tablas de su área y las herramientas de alto nivel que le tocan.
 * Todos tienen además acceso completo a la base de datos (db_*) y pueden pedir
 * borrados (que siempre pasan por la doble confirmación con botones).
 */

export type ModuleKey =
  | 'comercial'
  | 'coldcalling'
  | 'marketing'
  | 'proyectos'
  | 'finanzas'
  | 'soporte'
  | 'agenda'
  | 'sistema'

export type AgentModule = {
  key: ModuleKey
  nombre: string
  descripcion: string
  tablas: string[]
  /** Herramientas de la secretaria (lib/demos/crm-assistant-tools) que puede usar. */
  herramientas: string[]
  guia: string
}

export const AGENT_MODULES: AgentModule[] = [
  {
    key: 'comercial',
    nombre: 'Comercial y pipeline',
    descripcion: 'Contactos, leads, estados, notas, pipelines/kanban, actividades del CRM, propuestas.',
    tablas: ['contacts', 'leads', 'pipelines', 'pipeline_stages', 'pipeline_cards', 'crm_activities', 'messages', 'tasks'],
    herramientas: [
      'search_leads',
      'get_lead_detail',
      'search_contacts',
      'lookup_entity',
      'get_pipeline_brief',
      'append_lead_note',
      'update_lead_estado',
      'create_contact_and_lead',
    ],
    guia: `- contact → lead es 1:1 (leads.contact_id). Para crear un lead nuevo usa create_contact_and_lead.
- leads.estado (frio, caliente, reunion, propuesta, negociando, cerrado, activo, perdido) NO es la columna del kanban (pipeline_cards.stage_id).
- Para mover una tarjeta de pipeline: actualiza pipeline_cards (mira antes pipeline_stages del pipeline).
- leads.configuracion puede ser enorme (base64): no la selecciones entera, usa LENGTH() o left().`,
  },
  {
    key: 'coldcalling',
    nombre: 'Cold calling',
    descripcion: 'Campañas de llamadas, prospectos, llamadas, callbacks, comerciales y comisiones.',
    tablas: [
      'coldcall_campaigns',
      'coldcall_prospects',
      'coldcall_calls',
      'coldcall_activities',
      'coldcall_import_batches',
      'team_members',
      'crm_users',
    ],
    herramientas: ['lookup_entity'],
    guia: `- coldcall_prospects.stage es el embudo de cold calling (no confundir con leads.estado).
- Antes de cambiar algo, describe la tabla: los nombres de columnas varían entre campañas antiguas y nuevas.`,
  },
  {
    key: 'marketing',
    nombre: 'Marketing',
    descripcion: 'Meta Ads (campañas, leads de formularios), formularios web, reservas Cal.com, blog, costes por canal.',
    tablas: [
      'meta_lead_events',
      'meta_ad_campaigns',
      'meta_ad_campaign_daily_stats',
      'meta_ad_period_reach',
      'marketing_metrics',
      'channel_cost_overrides',
      'web_form_submissions',
      'cal_bookings',
      'blog_docs',
      'instantly_webhooks',
    ],
    herramientas: ['run_domain_agent'],
    guia: `- Para métricas rápidas usa run_domain_agent con domains ["marketing"].
- Gasto/CPL de Meta: meta_ad_campaign_daily_stats (spend, leads…) agrupado por fecha.`,
  },
  {
    key: 'proyectos',
    nombre: 'Proyectos y onboarding',
    descripcion: 'Proyectos de clientes, tareas, developers asignados, onboarding, auditorías, formularios públicos.',
    tablas: [
      'proyectos',
      'project_dev_tasks',
      'project_dev_task_attachments',
      'project_dev_onboarding',
      'project_dev_onboarding_docs',
      'developer_assignments',
      'crm_user_projects',
      'project_audits',
      'onboarding_public_forms',
      'onboarding_form_submissions',
      'engranaje5_data',
      'engranaje5_kpis',
    ],
    herramientas: [
      'search_proyectos',
      'get_proyecto_detail',
      'create_project_task',
      'update_proyecto_status',
      'lookup_entity',
    ],
    guia: `- Cartera abierta = es_buffalo AND status IN (development, active, paused).
- setup_fee_eur es el pago único; monthly_fee_eur la mensualidad.
- Para crear tareas de proyecto usa create_project_task con confirm=true.`,
  },
  {
    key: 'finanzas',
    nombre: 'Finanzas',
    descripcion: 'Facturas emitidas y recurrentes, gastos, gastos fijos, sueldos, ingresos, banco, objetivos, IVA.',
    tablas: [
      'invoices',
      'recurring_invoices',
      'expenses',
      'fixed_expenses',
      'salaries',
      'financial_incomes',
      'financial_settings',
      'bank_transactions',
      'bank_accounts',
      'bank_connections',
      'bank_statements',
      'finance_ai_analyses',
    ],
    herramientas: ['get_finance_brief', 'get_bank_recent', 'search_invoices', 'run_domain_agent'],
    guia: `- Facturado = invoices.total con status='sent' y deleted_at IS NULL. Cobrado = bank_transactions.amount > 0.
- Las facturas NO se borran físicamente: se marcan deleted_at (y las emitidas se corrigen con rectificativas). Si te piden "borrar una factura", propón poner deleted_at = NOW() con db_actualizar y explícalo.
- Para un resumen rápido usa get_finance_brief.`,
  },
  {
    key: 'soporte',
    nombre: 'Soporte y operaciones',
    descripcion: 'Tickets de clientes, respuestas, incidencias de retención, vigilancia de sistemas, checklist del equipo.',
    tablas: [
      'tickets',
      'ticket_updates',
      'ticket_field_discoveries',
      'retencion_incidents',
      'retencion_watch_runs',
      'retencion_watch_memory',
      'crm_checklist_items',
      'ops_alert_messages',
    ],
    herramientas: [
      'search_tickets',
      'ticket_reply',
      'ticket_set_status',
      'checklist_list',
      'checklist_add',
      'checklist_complete',
    ],
    guia: `- Checklist: columnas inbox | santi | sergi. Usa checklist_* con confirm=true.
- Para responder a un ticket usa ticket_reply (queda en ticket_updates).`,
  },
  {
    key: 'agenda',
    nombre: 'Agenda y comunicación',
    descripcion: 'Reuniones Google Calendar/Meet, grabaciones y transcripciones de reuniones, emails salientes.',
    tablas: ['google_calendar_event_notes', 'google_calendar_connections', 'meeting_recordings', 'cal_bookings'],
    herramientas: ['create_calendar_meeting', 'send_email', 'lookup_entity'],
    guia: `- Fechas en ISO 8601 con zona Europe/Madrid (p. ej. 2026-11-03T10:00:00+01:00).
- Un email a alguien de fuera: si el socio no te dictó el texto exacto, enseña el borrador (send_email con confirm=false) y espera su OK.`,
  },
  {
    key: 'sistema',
    nombre: 'Sistema y configuración',
    descripcion:
      'Usuarios del CRM y permisos, demos/agentes de WhatsApp, suscripciones push, historial de avisos, configuración y registro del propio agente de Telegram.',
    tablas: [
      'crm_users',
      'crm_user_projects',
      'demos',
      'demo_numeros',
      'push_subscriptions',
      'ops_alert_messages',
      'telegram_agent_instructions',
      'telegram_agent_reminders',
      'telegram_agent_audit',
      'telegram_agent_pending',
    ],
    herramientas: [],
    guia: `- crm_users.password_hash: NUNCA lo muestres ni lo cambies por SQL. No hay forma segura de poner contraseñas desde aquí.
- El acceso al agente de Telegram (qué socios pueden usarlo) NO se cambia desde el chat: se configura en el servidor.
- telegram_agent_audit es el registro de lo que ha hecho el agente: úsalo para "¿qué has cambiado hoy?".`,
  },
]

export function getModule(key: string): AgentModule | null {
  return AGENT_MODULES.find((m) => m.key === key) || null
}

export const MODULE_KEYS = AGENT_MODULES.map((m) => m.key)
