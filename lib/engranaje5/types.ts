/** Config JSON from configurador.html → buildOnboardingConfig() */
export interface ConfiguradorConfig {
  ref?: string
  empresa?: string
  nombre?: string
  email?: string
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
}

export type ProyectoServiceType =
  | 'voice_agent'
  | 'text_agent'
  | 'dashboard_app'
  | 'automation'
  | 'lead_gen'
  | 'geo_seo'

export type ProyectoStatus = 'development' | 'active' | 'paused' | 'churned'

export type DashboardTier = 'basico' | 'avanzado' | 'completo'
