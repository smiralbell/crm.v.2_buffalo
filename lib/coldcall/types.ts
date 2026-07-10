export const LEAD_STAGES = [
  'nuevo',
  'en_cola',
  'volver_a_llamar',
  'interesado_info_enviada',
  'reunion_agendada',
  'no_interesado',
  'descartado_numero_erroneo',
] as const

export type LeadStage = (typeof LEAD_STAGES)[number]

export const STAGE_LABELS: Record<LeadStage, string> = {
  nuevo: 'Nuevo',
  en_cola: 'En cola',
  volver_a_llamar: 'Volver a llamar',
  interesado_info_enviada: 'Info enviada',
  reunion_agendada: 'Reunión agendada',
  no_interesado: 'No interesado',
  descartado_numero_erroneo: 'Número erróneo',
}

export const CALL_OUTCOMES = [
  'sin_respuesta',
  'buzon_voz',
  'llamar_tarde',
  'interesado',
  'reunion_agendada',
  'no_interesado',
  'numero_erroneo',
] as const

export type CallOutcome = (typeof CALL_OUTCOMES)[number]

export interface ColdCallCampaign {
  id: number
  name: string
  description: string | null
  status: 'active' | 'paused' | 'archived'
  assigned_to_user_id: number | null
  created_by_user_id: number | null
  created_at: string
  updated_at: string
  import_columns?: string[] | null
  column_mapping?: Record<string, string> | null
  script_markdown_es?: string | null
  script_markdown_ca?: string | null
  stats?: CampaignStats
  assignee_name?: string | null
}

export interface CampaignStats {
  total_leads: number
  in_queue: number
  contacted: number
  interested: number
  meetings: number
  dnc: number
}

export interface ImportBatchResult {
  batch_id: number
  rows_total: number
  rows_imported: number
  rows_skipped_duplicate: number
  rows_skipped_dnc: number
}

export interface CsvLeadInput {
  rawData: Record<string, string>
  nombre: string
  firstName: string | null
  lastName: string | null
  telefono: string | null
  email: string | null
  empresa: string | null
  cargo: string | null
  sector: string | null
  ciudad: string | null
  linkedin: string | null
  web: string | null
  cif: string | null
  direccion: string | null
  doNotCall: boolean
  dedupeKey: string
}

export interface ApolloLeadInput {
  firstName: string
  lastName: string
  title: string | null
  companyName: string | null
  email: string | null
  emailStatus: string | null
  workPhone: string | null
  homePhone: string | null
  mobilePhone: string | null
  corporatePhone: string | null
  otherPhone: string | null
  doNotCall: boolean
  employeeCount: number | null
  industry: string | null
  keywords: string | null
  personLinkedinUrl: string | null
  companyLinkedinUrl: string | null
  website: string | null
  city: string | null
  state: string | null
  country: string | null
  apolloContactId: string | null
  apolloAccountId: string | null
  apolloData: Record<string, string>
  dedupeKey: string
  nombre: string
  telefono: string | null
}
