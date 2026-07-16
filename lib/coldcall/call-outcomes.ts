import { prisma } from '@/lib/prisma'
import type { CallOutcome } from './types'
import {
  deleteProspectPipelineCard,
  syncProspectPipelineCard,
} from '@/lib/pipelines/cold-calling'

const OUTCOME_TO_STAGE: Record<string, string> = {
  interesado: 'interesado_info_enviada',
  reunion_agendada: 'reunion_agendada',
  no_interesado: 'no_interesado',
  llamar_tarde: 'volver_a_llamar',
  sin_respuesta: 'en_cola',
  buzon_voz: 'en_cola',
  numero_erroneo: 'descartado_numero_erroneo',
  no_contactar: 'no_interesado',
}

const OUTCOME_TO_ESTADO: Record<string, string> = {
  interesado: 'interesado',
  reunion_agendada: 'reunion_agendada',
  no_interesado: 'no_interesado',
  llamar_tarde: 'llamar_tarde',
  sin_respuesta: 'sin_respuesta',
  buzon_voz: 'sin_respuesta',
  numero_erroneo: 'no_contactar',
  no_contactar: 'no_contactar',
}

export async function applyCallOutcome(input: {
  prospectId: number
  outcome: CallOutcome | string
  notas?: string | null
  userId?: number | null
  retryAt?: Date | null
}) {
  const prospectRows = await prisma.$queryRaw<
    { call_attempts: number; campaign_id: number | null }[]
  >`
    SELECT call_attempts, campaign_id FROM coldcall_prospects
    WHERE id = ${input.prospectId} AND deleted_at IS NULL LIMIT 1
  `
  const prospect = prospectRows[0]
  if (!prospect) return null

  let callAttempts = prospect.call_attempts
  let nextRetryAt: Date | null = input.retryAt ?? null
  let stage = OUTCOME_TO_STAGE[input.outcome] || 'en_cola'
  const estado = OUTCOME_TO_ESTADO[input.outcome] || 'pendiente'

  if (input.outcome === 'sin_respuesta' || input.outcome === 'buzon_voz') {
    callAttempts += 1
    if (input.retryAt) {
      nextRetryAt = input.retryAt
      stage = 'en_cola'
    } else if (callAttempts < 3) {
      const later = new Date()
      later.setHours(later.getHours() + 4)
      nextRetryAt = later
      stage = 'en_cola'
    } else {
      stage = 'no_interesado'
      nextRetryAt = null
    }
  }

  if (input.outcome === 'numero_erroneo') {
    await deleteProspectPipelineCard(input.prospectId)
    await prisma.$executeRaw`
      DELETE FROM coldcall_prospects WHERE id = ${input.prospectId}
    `
    return { deleted: true }
  }

  const trimmedNotes = input.notas?.trim() || null

  await prisma.$executeRaw`
    UPDATE coldcall_prospects SET
      estado = ${estado},
      stage = ${stage},
      call_attempts = ${callAttempts},
      next_retry_at = ${nextRetryAt},
      lost_reason = ${input.outcome === 'no_interesado' ? trimmedNotes : null},
      notas = COALESCE(${trimmedNotes}, notas),
      updated_at = NOW()
    WHERE id = ${input.prospectId}
  `

  await prisma.$executeRaw`
    INSERT INTO coldcall_activities (prospect_id, activity_type, content, outcome, created_by_user_id)
    VALUES (
      ${input.prospectId},
      'call_result',
      ${trimmedNotes},
      ${input.outcome},
      ${input.userId ?? null}
    )
  `

  await syncProspectPipelineCard(input.prospectId, {
    outcome: input.outcome,
    callAttempts,
  })

  return { deleted: false, stage, callAttempts, nextRetryAt }
}
