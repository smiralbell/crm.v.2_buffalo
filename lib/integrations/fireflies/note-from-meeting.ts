import type { MeetingRecordingRow } from '@/lib/integrations/fireflies/store'

const FIREFLIES_MARKER = (firefliesId: string) => `<!-- fireflies:${firefliesId} -->`

export function firefliesNoteMarker(firefliesId: string): string {
  return FIREFLIES_MARKER(firefliesId)
}

export function noteMentionsFireflies(body: string, firefliesId: string): boolean {
  return body.includes(FIREFLIES_MARKER(firefliesId))
}

/** Cuerpo de nota de reunión a partir del resumen + transcripción Fireflies. */
export function buildMeetingNoteBody(meeting: MeetingRecordingRow): string {
  const title = meeting.title?.trim() || 'Reunión Fireflies'
  const when = meeting.started_at
    ? meeting.started_at.toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'sin fecha'
  const link = meeting.transcript_url?.trim() || ''
  const overview = (meeting.summary_overview || '').trim()
  const actions = (meeting.summary_action_items || '').trim()
  let transcript = (meeting.transcript || '').trim()
  const MAX_TRANSCRIPT = 80_000
  if (transcript.length > MAX_TRANSCRIPT) {
    transcript =
      transcript.slice(0, MAX_TRANSCRIPT) +
      '\n\n…[transcripción truncada; ver enlace Fireflies]…'
  }

  const parts: string[] = [
    `# ${title}`,
    `Fecha: ${when}`,
  ]
  if (link) parts.push(`Enlace Fireflies: ${link}`)
  parts.push(
    '',
    '## Resumen',
    overview || '(Sin resumen todavía — se actualizará cuando Fireflies lo genere.)',
    ''
  )

  if (actions) {
    parts.push('## Action items', actions, '')
  }

  if (transcript) {
    parts.push('## Transcripción', transcript, '')
  }

  parts.push(FIREFLIES_MARKER(meeting.fireflies_id))
  return parts.join('\n').trim()
}

export function buildMeetingNoteTitle(meeting: MeetingRecordingRow): string {
  const base = meeting.title?.trim() || 'Reunión Fireflies'
  const when = meeting.started_at
    ? meeting.started_at.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
      })
    : null
  return when ? `${base} · ${when}` : base
}

/** Texto corto para historial de ficha (contacto / lead). */
export function buildMeetingFichaBody(meeting: MeetingRecordingRow): string {
  const overview = (meeting.summary_overview || '').trim()
  const link = meeting.transcript_url?.trim()
  const actions = (meeting.summary_action_items || '').trim()
  return [
    overview || 'Reunión sincronizada desde Fireflies (sin resumen aún).',
    actions ? `Action items:\n${actions}` : null,
    link ? `Transcripción: ${link}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}
