import type { ProjectServiceFlags } from './data-column-guide'

export interface KpiItem {
  kpi_key: string
  kpi_label: string
  kpi_category: string
  kpi_value: number | null
  kpi_unit: string | null
  kpi_value_label: string | null
  chart_type: string
  is_star_kpi: boolean
  visible_dashboard: boolean
  trend_vs_prev_month: number | null
  trend_direction: string | null
}

type KpiTemplate = Omit<KpiItem, 'kpi_value' | 'kpi_value_label' | 'trend_vs_prev_month' | 'trend_direction'> & {
  services?: ('voz' | 'chat' | 'dash')[]
}

const CATEGORY_LABELS: Record<string, string> = {
  roi: 'ROI',
  uso: 'Uso',
  calidad: 'Calidad',
  coste: 'Coste',
  disponibilidad: 'Disponibilidad',
  satisfaccion: 'Satisfacción',
  riesgo: 'Riesgo',
}

export { CATEGORY_LABELS }

const TEMPLATES: KpiTemplate[] = [
  { kpi_key: 'total_interactions', kpi_label: 'Interacciones totales', kpi_category: 'uso', chart_type: 'numero', is_star_kpi: true, visible_dashboard: true, kpi_unit: null },
  { kpi_key: 'resolution_rate', kpi_label: 'Tasa de resolución', kpi_category: 'calidad', chart_type: 'gauge', is_star_kpi: true, visible_dashboard: true, kpi_unit: '%' },
  { kpi_key: 'nps_score_avg', kpi_label: 'NPS medio', kpi_category: 'satisfaccion', chart_type: 'numero', is_star_kpi: true, visible_dashboard: true, kpi_unit: '/10' },
  { kpi_key: 'infra_cost_usd', kpi_label: 'Coste infraestructura', kpi_category: 'coste', chart_type: 'numero', is_star_kpi: true, visible_dashboard: true, kpi_unit: 'USD' },

  { kpi_key: 'calls_inbound', kpi_label: 'Llamadas entrantes', kpi_category: 'uso', chart_type: 'barras', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['voz'] },
  { kpi_key: 'total_call_minutes', kpi_label: 'Minutos gestionados', kpi_category: 'uso', chart_type: 'linea', is_star_kpi: false, visible_dashboard: true, kpi_unit: 'min', services: ['voz'] },
  { kpi_key: 'avg_confidence_score', kpi_label: 'Confianza del agente', kpi_category: 'calidad', chart_type: 'gauge', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['voz'] },
  { kpi_key: 'human_transfers', kpi_label: 'Transferencias a humano', kpi_category: 'calidad', chart_type: 'barras', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['voz'] },
  { kpi_key: 'top_intents', kpi_label: 'Top intenciones', kpi_category: 'uso', chart_type: 'donut', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['voz'] },

  { kpi_key: 'conversations_total', kpi_label: 'Conversaciones totales', kpi_category: 'uso', chart_type: 'barras', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['chat'] },
  { kpi_key: 'avg_response_time_ms', kpi_label: 'Tiempo de respuesta', kpi_category: 'calidad', chart_type: 'linea', is_star_kpi: false, visible_dashboard: true, kpi_unit: 'ms', services: ['chat'] },
  { kpi_key: 'llm_cost_usd', kpi_label: 'Coste LLM', kpi_category: 'coste', chart_type: 'numero', is_star_kpi: false, visible_dashboard: true, kpi_unit: 'USD', services: ['chat'] },
  { kpi_key: 'tokens_total', kpi_label: 'Tokens consumidos', kpi_category: 'coste', chart_type: 'barras', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['chat'] },
  { kpi_key: 'top_topics', kpi_label: 'Top temas', kpi_category: 'uso', chart_type: 'donut', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['chat'] },

  { kpi_key: 'sessions_total', kpi_label: 'Sesiones totales', kpi_category: 'uso', chart_type: 'barras', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['dash'] },
  { kpi_key: 'users_unique', kpi_label: 'Usuarios únicos', kpi_category: 'uso', chart_type: 'numero', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['dash'] },
  { kpi_key: 'conversions_total', kpi_label: 'Conversiones', kpi_category: 'roi', chart_type: 'numero', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['dash'] },
  { kpi_key: 'days_inactive_streak', kpi_label: 'Días sin actividad', kpi_category: 'riesgo', chart_type: 'gauge', is_star_kpi: false, visible_dashboard: true, kpi_unit: 'días', services: ['dash'] },
  { kpi_key: 'features_used', kpi_label: 'Features más usadas', kpi_category: 'uso', chart_type: 'donut', is_star_kpi: false, visible_dashboard: true, kpi_unit: null, services: ['dash'] },

  { kpi_key: 'uptime_pct', kpi_label: 'Disponibilidad', kpi_category: 'disponibilidad', chart_type: 'gauge', is_star_kpi: false, visible_dashboard: true, kpi_unit: '%' },
  { kpi_key: 'incidents_count', kpi_label: 'Incidencias', kpi_category: 'disponibilidad', chart_type: 'barras', is_star_kpi: false, visible_dashboard: true, kpi_unit: null },
  { kpi_key: 'interactions_escalated', kpi_label: 'Escalados', kpi_category: 'calidad', chart_type: 'barras', is_star_kpi: false, visible_dashboard: true, kpi_unit: null },
]

function serviceActive(flags: ProjectServiceFlags, svc: 'voz' | 'chat' | 'dash'): boolean {
  if (svc === 'voz') return flags.has_voz
  if (svc === 'chat') return flags.has_chat
  return flags.has_dash
}

export function buildDefaultKpiLayout(flags: ProjectServiceFlags): KpiItem[] {
  return TEMPLATES.filter((t) => {
    if (!t.services?.length) return true
    return t.services.some((s) => serviceActive(flags, s))
  }).map((t) => ({
    kpi_key: t.kpi_key,
    kpi_label: t.kpi_label,
    kpi_category: t.kpi_category,
    kpi_value: null,
    kpi_unit: t.kpi_unit,
    kpi_value_label: null,
    chart_type: t.chart_type,
    is_star_kpi: t.is_star_kpi,
    visible_dashboard: t.visible_dashboard,
    trend_vs_prev_month: null,
    trend_direction: null,
  }))
}

export function mergeKpisWithLayout(
  fromDb: KpiItem[],
  flags: ProjectServiceFlags
): KpiItem[] {
  if (fromDb.length === 0) return buildDefaultKpiLayout(flags)
  return fromDb.filter((k) => k.visible_dashboard)
}

export function groupKpisByCategory(kpis: KpiItem[]): Map<string, KpiItem[]> {
  const map = new Map<string, KpiItem[]>()
  for (const k of kpis) {
    if (k.is_star_kpi) continue
    const list = map.get(k.kpi_category) || []
    list.push(k)
    map.set(k.kpi_category, list)
  }
  return map
}
