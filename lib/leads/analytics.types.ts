export type ChannelKey =
  | 'web'
  | 'email'
  | 'cold_calling'
  | 'instagram'
  | 'whatsapp'
  | 'referral'
  | 'other'
  | 'unknown'

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  web: 'Web',
  email: 'Email marketing',
  cold_calling: 'Cold calling',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  referral: 'Referido',
  other: 'Otros',
  unknown: 'Sin origen',
}

export const CHANNEL_COLORS: Record<ChannelKey, string> = {
  web: '#111827',
  email: '#2563EB',
  cold_calling: '#059669',
  instagram: '#DB2777',
  whatsapp: '#16A34A',
  referral: '#D97706',
  other: '#6B7280',
  unknown: '#9CA3AF',
}

export type LeadListItem = {
  id: number
  name: string
  empresa: string | null
  email: string | null
  channel: ChannelKey
  channel_label: string
  created_at: string | null
}

export type ChannelBreakdownRow = {
  channel: ChannelKey
  label: string
  leads: number
  scheduled: number
  /** 1ª factura pagada */
  clients: number
  /** 2ª factura pagada + producción acabada */
  closed: number
  lead_to_client_pct: number
  lead_to_closed_pct: number
  /** Valor pipeline (setup_fee o lead.valor) de los leads del canal */
  pipeline_eur: number
  /** € cobrados en 1ª factura de setup (ganados del cohort) */
  won_eur: number
  /** € cobrados en 2ª factura (cerrados del cohort) */
  closed_eur: number
  /** Inversión del canal este mes */
  spend_eur: number
  /** Origen del coste */
  spend_source: 'manual' | 'bank' | 'marketing_metrics' | 'default_email' | 'none' | 'mixed'
  /** pipeline_eur / spend — € de leads por cada € invertido */
  eur_per_euro_leads: number | null
  /** won_eur / spend — € cobrados de clientes por cada € invertido */
  eur_per_euro_clients: number | null
  /** ROI clientes: ((won_eur - spend) / spend) * 100 */
  return_pct: number | null
  /** ROI pipeline: ((pipeline_eur - spend) / spend) * 100 */
  return_pct_leads: number | null
  /** won_eur / leads */
  eur_per_lead: number
  lead_items: LeadListItem[]
  scheduled_items: LeadListItem[]
  client_items: LeadListItem[]
  closed_items: LeadListItem[]
}

export type ChannelRentabilityInsight = {
  channel: ChannelKey
  label: string
  leads: number
  clients: number
  won_eur: number
  pipeline_eur: number
  spend_eur: number
  eur_per_lead: number
  eur_per_euro_clients: number | null
  return_pct: number | null
  conversion_pct: number
  reason: string
  method: 'roi_clients' | 'won_eur_per_lead' | 'conversion' | 'pipeline_per_lead'
}

export type TimelinePoint = {
  day: string
  label: string
  total: number
} & Partial<Record<ChannelKey, number>>

export type ColdCallFunnel = {
  available: boolean
  calls: number
  meetings: number
  leads: number
  clients: number
  closed: number
  call_to_lead_pct: number
  lead_to_client_pct: number
  call_to_client_pct: number
  meeting_to_lead_pct: number
  lead_items: LeadListItem[]
  client_items: LeadListItem[]
  closed_items: LeadListItem[]
}

export type LeadsAnalytics = {
  period: string
  period_label: string
  kpis: {
    leads_total: number
    leads_scheduled: number
    /** 1ª factura cobrada este mes */
    clients_won: number
    /** 2ª factura cobrada + proyecto finalizado en producción (por fecha_fin_real) */
    clients_closed: number
    lead_to_client_pct: number
    /** % de leads creados en el mes que están en REUNIÓN del pipeline global */
    scheduled_pct: number
    /** Reuniones Cal.com / cold call ya celebradas (start_time ≤ ahora) en el mes */
    meetings_total: number
    /** % de leads con reunión celebrada que pasaron a cliente (1ª factura) */
    meeting_to_client_pct: number
    /** % de clientes ganados del mes que tuvieron reunión celebrada */
    won_with_meeting_pct: number
  }
  lists: {
    leads_total: LeadListItem[]
    /** Tarjetas en REUNIÓN del pipeline global */
    leads_scheduled: LeadListItem[]
    clients_won: LeadListItem[]
    clients_closed: LeadListItem[]
    converted: LeadListItem[]
    /** Leads con reunión ya celebrada en el mes */
    meetings: LeadListItem[]
    meeting_to_client: LeadListItem[]
  }
  by_channel: ChannelBreakdownRow[]
  best_channel: ChannelRentabilityInsight | null
  timeline: TimelinePoint[]
  cold_calling: ColdCallFunnel
  suggestions: string[]
}

export function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
