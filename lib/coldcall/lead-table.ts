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

/** Verde = pendiente de llamar · Rojo = ya llamado al menos una vez */
export function leadCallStatus(lead: Pick<CampaignLeadRow, 'call_count' | 'call_attempts'>): {
  called: boolean
  rowClassName: string
} {
  const calls = Number(lead.call_count ?? lead.call_attempts ?? 0)
  const called = calls > 0
  return {
    called,
    rowClassName: called
      ? 'bg-red-50 hover:bg-red-100/80'
      : 'bg-emerald-50 hover:bg-emerald-100/80',
  }
}

export function campaignExhausted(stats?: {
  total_leads?: number
  contacted?: number
} | null): boolean {
  const total = Number(stats?.total_leads ?? 0)
  const contacted = Number(stats?.contacted ?? 0)
  return total > 0 && contacted >= total
}
