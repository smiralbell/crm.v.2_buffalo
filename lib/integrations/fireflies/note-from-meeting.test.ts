import { describe, expect, it } from 'vitest'
import {
  buildMeetingFichaBody,
  buildMeetingNoteBody,
  buildMeetingNoteTitle,
  firefliesNoteMarker,
  noteMentionsFireflies,
} from '@/lib/integrations/fireflies/note-from-meeting'
import type { MeetingRecordingRow } from '@/lib/integrations/fireflies/store'

function sample(partial: Partial<MeetingRecordingRow> = {}): MeetingRecordingRow {
  return {
    id: 'm1',
    fireflies_id: 'ff-abc',
    title: 'Discovery Acme',
    meeting_link: null,
    transcript_url: 'https://app.fireflies.ai/view/ff-abc',
    host_email: 'sergi@agenciabuffalo.es',
    organizer_email: null,
    participants: [],
    started_at: new Date('2026-08-13T10:00:00.000Z'),
    duration_minutes: 32,
    transcript: 'Hola, hablamos del agente de voz.',
    summary_overview: 'Quieren un agente de voz para recepción.',
    summary_action_items: '- Enviar propuesta',
    summary_json: null,
    status: 'matched',
    match_reason: 'email:cli@acme.com',
    lead_id: 1,
    contact_id: 2,
    fireflies_synced_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...partial,
  }
}

describe('note-from-meeting', () => {
  it('incluye resumen, action items, transcripción, enlace y marker', () => {
    const body = buildMeetingNoteBody(sample())
    expect(body).toContain('Quieren un agente de voz')
    expect(body).toContain('Enviar propuesta')
    expect(body).toContain('Hola, hablamos del agente')
    expect(body).toContain('https://app.fireflies.ai/view/ff-abc')
    expect(body).toContain(firefliesNoteMarker('ff-abc'))
    expect(noteMentionsFireflies(body, 'ff-abc')).toBe(true)
  })

  it('ficha body lleva resumen + enlace', () => {
    const ficha = buildMeetingFichaBody(sample())
    expect(ficha).toContain('Quieren un agente de voz')
    expect(ficha).toContain('Transcripción: https://app.fireflies.ai/view/ff-abc')
  })

  it('título de nota incluye nombre de reunión', () => {
    expect(buildMeetingNoteTitle(sample())).toContain('Discovery Acme')
  })
})
