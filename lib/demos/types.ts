export type DemoEstado = 'activa' | 'pausada'
export type DemoTipo = 'whatsapp' | 'voz'
export type DemoDireccion = 'inbound' | 'outbound' | 'ambos'

export interface DemoMessage {
  role: 'user' | 'assistant'
  content: string
  at?: string
}

export interface DemoRow {
  id: number
  nombre_cliente: string
  prompt: string
  base_conocimiento: string
  estado: DemoEstado
  tipo: DemoTipo
  retell_agent_id: string | null
  retell_llm_id: string | null
  retell_kb_id: string | null
  voz_id: string | null
  direccion: DemoDireccion | null
  created_at: string
}

export interface DemoListItem extends DemoRow {
  numeros: string[]
  numeros_count: number
}

export interface DemoInput {
  nombre_cliente: string
  prompt: string
  base_conocimiento: string
  estado: DemoEstado
  numeros: string[]
  tipo?: DemoTipo
  voz_id?: string
  direccion?: DemoDireccion
}

export interface PhoneConflict {
  numero_telefono: string
  demo_id: number
  nombre_cliente: string
  demo_tipo?: DemoTipo
}

export interface DemoSaveOptions {
  /** Quita el número de la demo anterior y lo asigna a esta */
  mover_numeros?: boolean
}

export type DemoSessionStatus = 'ok' | 'error' | 'pending'

export interface DemoMetrics {
  testers_count: number
  successful_count: number
  failed_count: number
  total_user_messages: number
  total_assistant_messages: number
  last_activity_at: string | null
  sessions: DemoSessionRow[]
}

export interface DemoSessionRow {
  phone: string
  phone_masked: string
  user_messages: number
  assistant_messages: number
  status: DemoSessionStatus
  updated_at: string
}

export interface DemoDetail extends DemoListItem {
  metrics: DemoMetrics
  voice_metrics?: DemoVoiceMetrics
  formulario_outbound?: OutboundFormFieldRef[]
  form_access?: FormPublicAccess
  formulario_branding?: OutboundFormBrandingRef
}

export interface FormPublicAccess {
  public_token: string | null
  public_url: string | null
  has_password: boolean
}

export type OutboundFormFieldRef = {
  key: string
  label: string
  enabled: boolean
  required: boolean
  placeholder?: string
}

export type OutboundFormBrandingRef = {
  logo_url: string | null
  color_primary: string
  color_secondary: string
  font_id: string
}

export interface DemoVoiceSessionRow {
  phone: string
  phone_masked: string
  nombre: string | null
  calls_count: number
  status: DemoSessionStatus
  updated_at: string
}

export interface DemoVoiceMetrics {
  testers_count: number
  successful_count: number
  failed_count: number
  total_calls: number
  last_activity_at: string | null
  sessions: DemoVoiceSessionRow[]
}

export interface DemoConversationDetail {
  phone: string
  messages: DemoMessage[]
  updated_at: string | null
}

export interface VoiceDemoMatch {
  demo_id: number
  nombre_cliente: string
  retell_agent_id: string
  direccion: DemoDireccion
}
