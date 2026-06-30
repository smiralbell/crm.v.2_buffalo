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
