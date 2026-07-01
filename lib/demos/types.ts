export type DemoEstado = 'activa' | 'pausada'

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
}

export interface PhoneConflict {
  numero_telefono: string
  demo_id: number
  nombre_cliente: string
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
}
