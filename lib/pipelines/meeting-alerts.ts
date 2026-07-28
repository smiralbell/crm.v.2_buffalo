import { isReunionStageName } from '@/lib/pipelines/global-funnel'

export type CardWithMeetingAlert = {
  id: string
  entity_id: string
  entity_type: string
  stage: string
  tags: string[]
  notes?: string | null
  meeting_alert?: boolean
}

/**
 * Alerta en tarjetas de REUNIÓN: el cliente ya tiene reunión agendada → hay que revisar.
 */
export async function attachMeetingAlerts<T extends CardWithMeetingAlert>(
  cards: T[]
): Promise<(T & { meeting_alert: boolean })[]> {
  return cards.map((c) => ({
    ...c,
    meeting_alert: isReunionStageName(c.stage),
  }))
}
