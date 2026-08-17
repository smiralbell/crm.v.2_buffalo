import { describe, expect, it } from 'vitest'
import {
  clientEmailsFromParticipants,
  isGenericEmailDomain,
  isInternalParticipantEmail,
} from '@/lib/integrations/fireflies/match'
import {
  isFirefliesPrematureEvent,
  isFirefliesTranscriptReadyEvent,
  parseFirefliesWebhookPayload,
} from '@/lib/integrations/fireflies/client'

describe('fireflies match helpers', () => {
  it('excluye emails internos de Buffalo', () => {
    expect(isInternalParticipantEmail('sergi@agenciabuffalo.es')).toBe(true)
    expect(isInternalParticipantEmail('cli@acme.com')).toBe(false)
  })

  it('solo devuelve emails externos de participantes', () => {
    const emails = clientEmailsFromParticipants([
      { email: 'sergi@agenciabuffalo.es', name: 'Sergi' },
      { email: 'cli@acme.com', name: 'Cliente' },
      { email: 'otro@cliente.io', name: 'Otro' },
    ])
    expect(emails.sort()).toEqual(['cli@acme.com', 'otro@cliente.io'])
  })

  it('trata Gmail como dominio genérico', () => {
    expect(isGenericEmailDomain('gmail.com')).toBe(true)
    expect(isGenericEmailDomain('planeta.es')).toBe(false)
  })
})

describe('fireflies webhook payload', () => {
  it('parsea V2', () => {
    expect(
      parseFirefliesWebhookPayload({
        event: 'meeting.transcribed',
        meeting_id: 'abc',
      })
    ).toEqual({ event: 'meeting.transcribed', meetingId: 'abc' })
  })

  it('parsea V1', () => {
    expect(
      parseFirefliesWebhookPayload({
        eventType: 'Transcription completed',
        meetingId: 'xyz',
      })
    ).toEqual({ event: 'Transcription completed', meetingId: 'xyz' })
  })

  it('ignora bot_joined y acepta summarized', () => {
    expect(isFirefliesPrematureEvent('meeting.bot_joined')).toBe(true)
    expect(isFirefliesTranscriptReadyEvent('meeting.summarized')).toBe(true)
    expect(isFirefliesTranscriptReadyEvent('Transcription completed')).toBe(true)
  })
})
