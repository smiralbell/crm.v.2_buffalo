import type { LeadStage } from './types'
import { STAGE_LABELS } from './types'

export interface CampaignLeadRow {
  id: number
  nombre: string
  telefono: string | null
  email: string | null
  stage: string
  call_attempts: number
  call_count?: number
  raw_data?: Record<string, string>
}

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  interesado: 'Interesado',
  reunion_agendada: 'Reunión agendada',
  no_interesado: 'No interesado',
  sin_respuesta: 'Sin respuesta',
  llamar_tarde: 'Llamar más tarde',
  no_contactar: 'No contactar',
}

export function stageLabel(stage: string): string {
  return (
    STAGE_LABELS[stage as LeadStage] ||
    ESTADO_LABELS[stage] ||
    stage.replace(/_/g, ' ')
  )
}

export function outcomeLabel(outcome: string): string {
  return ESTADO_LABELS[outcome] || outcome.replace(/_/g, ' ')
}

export function displayValue(v: string | null | undefined): string {
  if (v != null && String(v).trim() !== '') return String(v).trim()
  return '—'
}
