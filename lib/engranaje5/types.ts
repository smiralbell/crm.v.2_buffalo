/** Config JSON from configurador.html → buildOnboardingConfig() */
export interface ConfiguradorLineItem {
  description: string
  amount_eur: number
}

export interface ConfiguradorCustomQuestion {
  id: string
  label: string
  type?: 'text' | 'textarea'
}

export interface ConfiguradorConfig {
  mode?: 'packaged' | 'custom'
  ref?: string
  empresa?: string
  nombre?: string
  email?: string
  leadId?: number
  city?: string
  plazo?: string
  voz?: boolean
  voz_outbound?: boolean
  voz_crm?: boolean
  voz_transferir?: boolean
  voz_correo?: boolean
  voz_transcripcion?: boolean
  voz_lang?: number
  chat?: boolean
  chat_whatsapp?: boolean
  chat_widget?: boolean
  chat_trigger?: boolean
  chat_crm?: boolean
  chat_multimodal?: boolean
  chat_audios?: boolean
  chat_lang?: number
  clonada?: boolean
  dash?: boolean
  dash_tier?: string | null
  maint?: 'cloud' | 'connect' | null
  pack?: boolean

  /** Proyecto a medida (no empaquetado) */
  title?: string
  description?: string
  /**
   * Contexto bruto del proyecto: auditoría, reuniones, notas previas, texto pegado.
   * La definición (`description`) se regenera con IA a partir de este contexto.
   */
  project_context?: string
  /** Borrador de propuesta comercial generado con IA */
  proposal_draft?: string
  /** Estado de la propuesta: borrador o enviada al cliente */
  proposal_status?: 'draft' | 'sent'
  /** ISO cuando se marcó como enviada */
  proposal_sent_at?: string
  /** Borrador de contrato (Anexo I JSON) generado con IA */
  contract_draft?: string
  /** Estado del contrato: borrador o enviado al cliente */
  contract_status?: 'draft' | 'sent'
  /** ISO cuando se marcó el contrato como enviado */
  contract_sent_at?: string
  /** Borrador de pre-kick-off generado con IA */
  pre_kickoff_draft?: string
  /** Facturas vinculadas a este onboarding (hilo) */
  linked_invoices?: Array<{
    id: number
    invoice_number: string
    total: number
    status: string
    linked_at: string
  }>
  service_type?: ProyectoServiceType
  scope_items?: string[]
  line_items?: ConfiguradorLineItem[]
  setup_total_eur?: number
  monthly_fee_eur?: number | null
  payment_split?: '50_50' | '100_upfront'
  onboarding_notes?: string
  custom_questions?: ConfiguradorCustomQuestion[]
}

export type ProyectoServiceType =
  | 'voice_agent'
  | 'text_agent'
  | 'dashboard_app'
  | 'automation'
  | 'lead_gen'
  | 'geo_seo'
  | 'audit'

export type ProyectoStatus = 'development' | 'active' | 'paused' | 'churned'

export type DashboardTier = 'basico' | 'avanzado' | 'completo'
