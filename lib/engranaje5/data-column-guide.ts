export interface DataColumnDef {
  name: string
  type: string
  description: string
  requiresAddon?: keyof ProjectServiceFlags
}

export interface ProjectServiceFlags {
  has_voz: boolean
  has_chat: boolean
  has_dash: boolean
  has_pack: boolean
  addon_outbound: boolean
  addon_transcription: boolean
  addon_cloned_voice: boolean
  addon_human_transfer: boolean
  addon_email_summary: boolean
  addon_whatsapp: boolean
  addon_web_widget: boolean
  addon_form_trigger: boolean
  addon_multimodal: boolean
}

const COMMON: DataColumnDef[] = [
  { name: 'total_interactions', type: 'INTEGER', description: 'Total de llamadas/conversaciones/sesiones del mes' },
  { name: 'interactions_resolved', type: 'INTEGER', description: 'Resueltas sin intervención humana' },
  { name: 'interactions_escalated', type: 'INTEGER', description: 'Derivadas a un humano' },
  { name: 'interactions_abandoned', type: 'INTEGER', description: 'Abandonadas por el usuario' },
  { name: 'interactions_error', type: 'INTEGER', description: 'Fallidas por error técnico' },
  { name: 'infra_cost_usd', type: 'NUMERIC', description: 'Coste total de infraestructura del mes en USD' },
  { name: 'uptime_minutes', type: 'INTEGER', description: 'Minutos operativos del sistema' },
  { name: 'downtime_minutes', type: 'INTEGER', description: 'Minutos de incidencia' },
  { name: 'incidents_count', type: 'INTEGER', description: 'Número de incidencias técnicas del mes' },
  { name: 'improvements_applied', type: 'INTEGER', description: 'Mejoras aplicadas al proyecto ese mes' },
  { name: 'nps_score_avg', type: 'NUMERIC', description: 'Media del NPS recibido (0–10)' },
  { name: 'nps_responses_count', type: 'INTEGER', description: 'Número de respuestas NPS recibidas' },
]

const VOZ: DataColumnDef[] = [
  { name: 'calls_inbound', type: 'INTEGER', description: 'Llamadas entrantes del mes — Retell webhook / telefonía' },
  { name: 'calls_outbound', type: 'INTEGER', description: 'Llamadas salientes — Retell webhook', requiresAddon: 'addon_outbound' },
  { name: 'avg_call_duration_s', type: 'NUMERIC', description: 'Duración media de llamada en segundos — Retell' },
  { name: 'total_call_minutes', type: 'NUMERIC', description: 'Minutos totales gestionados por el agente — Retell' },
  { name: 'avg_confidence_score', type: 'NUMERIC', description: 'Confianza media del agente (0.0–1.0) — Retell' },
  { name: 'peak_calls_day', type: 'INTEGER', description: 'Llamadas en el día de mayor volumen del mes — agregación Retell' },
  { name: 'peak_calls_hour', type: 'INTEGER', description: 'Llamadas en la hora de mayor volumen — agregación Retell' },
  { name: 'transcriptions_stored', type: 'INTEGER', description: 'Transcripciones guardadas — Retell / storage', requiresAddon: 'addon_transcription' },
  { name: 'cloned_voice_used_pct', type: 'NUMERIC', description: '% de llamadas con voz clonada — Retell', requiresAddon: 'addon_cloned_voice' },
  { name: 'human_transfers', type: 'INTEGER', description: 'Transferencias reales ejecutadas a humano — Retell / n8n', requiresAddon: 'addon_human_transfer' },
  { name: 'email_summaries_sent', type: 'INTEGER', description: 'Emails resumen enviados tras la llamada — n8n', requiresAddon: 'addon_email_summary' },
  { name: 'top_intents_json', type: 'JSONB', description: 'Array JSON [{intent, count}] con las 5 intenciones más frecuentes — Retell / NLP' },
  { name: 'escalation_reasons_json', type: 'JSONB', description: 'Array JSON [{reason, count}] con motivos de escalado — n8n' },
]

const CHAT: DataColumnDef[] = [
  { name: 'conversations_whatsapp', type: 'INTEGER', description: 'Conversaciones por canal WhatsApp — Meta / n8n', requiresAddon: 'addon_whatsapp' },
  { name: 'conversations_web', type: 'INTEGER', description: 'Conversaciones por widget web — backend chat', requiresAddon: 'addon_web_widget' },
  { name: 'conversations_form', type: 'INTEGER', description: 'Conversaciones iniciadas por formulario — n8n', requiresAddon: 'addon_form_trigger' },
  { name: 'avg_messages_per_conv', type: 'NUMERIC', description: 'Media de mensajes por conversación — backend chat' },
  { name: 'avg_response_time_ms', type: 'NUMERIC', description: 'Tiempo medio de respuesta en milisegundos — backend / LLM' },
  { name: 'avg_conv_duration_s', type: 'NUMERIC', description: 'Duración media de conversación en segundos — backend chat' },
  { name: 'tokens_input_total', type: 'BIGINT', description: 'Tokens de entrada consumidos en el mes — billing del LLM' },
  { name: 'tokens_output_total', type: 'BIGINT', description: 'Tokens de salida generados en el mes — billing del LLM' },
  { name: 'llm_cost_usd', type: 'NUMERIC', description: 'Coste real del LLM en USD según billing — OpenAI / Anthropic' },
  { name: 'conversations_outside_hours', type: 'INTEGER', description: 'Conversaciones atendidas fuera de horario laboral — backend chat' },
  { name: 'top_topics_json', type: 'JSONB', description: 'Array JSON [{topic, count}] con los 5 temas más frecuentes — NLP' },
  { name: 'multimodal_inputs', type: 'INTEGER', description: 'Inputs de imagen o audio procesados — LLM multimodal', requiresAddon: 'addon_multimodal' },
]

const DASH: DataColumnDef[] = [
  { name: 'sessions_total', type: 'INTEGER', description: 'Sesiones totales en la app este mes — analytics' },
  { name: 'users_unique', type: 'INTEGER', description: 'Usuarios únicos activos (hash, sin PII) — analytics' },
  { name: 'avg_session_duration_s', type: 'NUMERIC', description: 'Duración media de sesión en segundos — analytics' },
  { name: 'avg_page_views', type: 'NUMERIC', description: 'Media de páginas vistas por sesión — analytics' },
  { name: 'conversions_total', type: 'INTEGER', description: 'Acciones objetivo completadas — analytics / CRM' },
  { name: 'reports_exported', type: 'INTEGER', description: 'Reportes o exportaciones generadas — app logs' },
  { name: 'sessions_mobile', type: 'INTEGER', description: 'Sesiones desde móvil/app nativa — analytics' },
  { name: 'features_used_json', type: 'JSONB', description: 'Array JSON [{feature, count}] de features usadas — product analytics' },
  { name: 'days_inactive_streak', type: 'INTEGER', description: 'Días consecutivos sin actividad (señal de churn) — analytics' },
]

function addonActive(flags: ProjectServiceFlags, key: keyof ProjectServiceFlags): boolean {
  return Boolean(flags[key])
}

function filterColumns(cols: DataColumnDef[], flags: ProjectServiceFlags): DataColumnDef[] {
  return cols.filter((c) => !c.requiresAddon || addonActive(flags, c.requiresAddon))
}

export function buildDataColumnGuide(flags: ProjectServiceFlags): DataColumnDef[] {
  const out: DataColumnDef[] = []
  if (flags.has_voz) out.push(...filterColumns(VOZ, flags))
  if (flags.has_chat) out.push(...filterColumns(CHAT, flags))
  if (flags.has_dash) out.push(...filterColumns(DASH, flags))
  out.push(...COMMON)
  return out
}

export function guideToMarkdown(projectId: string, flags: ProjectServiceFlags): string {
  const cols = buildDataColumnGuide(flags)
  const lines = [
    `# Guía engranaje5_data — project_id: ${projectId}`,
    '',
    'Usa este ID al insertar filas en `engranaje5_data`.',
    '',
    '| Columna | Tipo | Descripción |',
    '|---------|------|-------------|',
    ...cols.map((c) => `| \`${c.name}\` | ${c.type} | ${c.description} |`),
  ]
  return lines.join('\n')
}

export type { ProjectServiceFlags as ProyectoServiceFlags }
