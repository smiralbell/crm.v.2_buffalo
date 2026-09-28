export type FormacionIntent = 'diagnostico' | 'fundae'

export type FormacionDiagnosticoRow = {
  id: number
  intent: FormacionIntent
  nombre: string
  empresa: string
  email: string
  telefono: string | null
  trabajadores: string
  funcion: string
  uso_ia: string
  credito_fundae: string
  objetivo: string
  consentimiento: boolean
  created_at: string
}

export const FORMACION_INTENT_LABELS: Record<FormacionIntent, string> = {
  diagnostico: 'Diagnóstico',
  fundae: 'Crédito FUNDAE',
}
