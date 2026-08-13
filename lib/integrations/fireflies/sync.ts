import {
  extractParticipants,
  fetchFirefliesTranscript,
  fetchRecentFirefliesTranscripts,
  formatTranscriptText,
  isFirefliesConfigured,
  pickActionItems,
  pickSummaryOverview,
  startedAtFromTranscript,
  type FirefliesTranscript,
} from '@/lib/integrations/fireflies/client'
import { matchCrmFromParticipants } from '@/lib/integrations/fireflies/match'
import { routeFirefliesMeeting } from '@/lib/integrations/fireflies/route-meeting'
import {
  getMeetingByFirefliesId,
  toMeetingDto,
  upsertMeetingRecording,
  type MeetingRecordingRow,
} from '@/lib/integrations/fireflies/store'

export async function ingestFirefliesTranscript(
  t: FirefliesTranscript,
  opts?: { forceRematch?: boolean; skipRoute?: boolean }
): Promise<MeetingRecordingRow> {
  const participants = extractParticipants(t)
  const existing = await getMeetingByFirefliesId(t.id)

  let leadId: number | null | undefined = undefined
  let contactId: number | null | undefined = undefined
  let status: 'pending_match' | 'matched' | 'ignored' | undefined
  let matchReason: string | null | undefined = undefined

  const shouldMatch =
    opts?.forceRematch ||
    !existing?.lead_id ||
    existing.status === 'pending_match' ||
    (!existing?.contact_id && existing.status !== 'ignored')

  if (shouldMatch && existing?.status !== 'ignored') {
    const match = await matchCrmFromParticipants(participants)
    if (match.kind === 'lead') {
      leadId = match.leadId
      contactId = match.contactId
      status = 'matched'
      matchReason = `email:${match.email}`
    } else if (match.kind === 'contact_only') {
      leadId = null
      contactId = match.contactId
      status = 'matched'
      matchReason = `contact_only:${match.email}`
    } else if (match.kind === 'ambiguous_leads') {
      // Deja pending; el router usa IA y asigna
      leadId = null
      contactId = match.hits.find((h) => h.contactId)?.contactId ?? null
      status = 'pending_match'
      matchReason = `ambiguous:${match.leadIds.join(',')}`
    } else if (!existing?.lead_id && !existing?.contact_id) {
      leadId = null
      contactId = null
      status = 'pending_match'
      matchReason = null
    }
  }

  const row = await upsertMeetingRecording({
    firefliesId: t.id,
    title: t.title,
    meetingLink: t.meeting_link,
    transcriptUrl: t.transcript_url,
    hostEmail: t.host_email?.toLowerCase() || null,
    organizerEmail: t.organizer_email?.toLowerCase() || null,
    participants,
    startedAt: startedAtFromTranscript(t),
    durationMinutes: t.duration != null ? Number(t.duration) : null,
    transcript: formatTranscriptText(t),
    summaryOverview: pickSummaryOverview(t.summary),
    summaryActionItems: pickActionItems(t.summary),
    summaryJson: t.summary || null,
    rawPayload: t,
    leadId,
    contactId,
    status,
    matchReason,
  })

  if (!opts?.skipRoute && row.status !== 'ignored') {
    try {
      const routed = await routeFirefliesMeeting(row)
      console.log(
        '[fireflies/sync] routed',
        JSON.stringify({
          fireflies_id: row.fireflies_id,
          action: routed.action,
          leadId: routed.leadId,
          contactId: routed.contactId,
          noteId: routed.noteId,
          reason: routed.reason,
        })
      )
      // Releer por si el router actualizó lead/contact/status
      const refreshed = await getMeetingByFirefliesId(t.id)
      return refreshed || row
    } catch (e) {
      console.error('[fireflies/sync] route error', e)
    }
  }

  return row
}

export async function syncFirefliesMeetingById(meetingId: string): Promise<MeetingRecordingRow> {
  if (!isFirefliesConfigured()) {
    throw new Error('FIREFLIES_API_KEY no está configurada')
  }
  const t = await fetchFirefliesTranscript(meetingId)
  if (!t) {
    throw new Error(`Fireflies: transcript ${meetingId} no encontrado`)
  }
  return ingestFirefliesTranscript(t)
}

export async function syncRecentFirefliesMeetings(limit = 20): Promise<{
  synced: number
  matched: number
  meetings: ReturnType<typeof toMeetingDto>[]
}> {
  if (!isFirefliesConfigured()) {
    throw new Error('FIREFLIES_API_KEY no está configurada')
  }
  const list = await fetchRecentFirefliesTranscripts(limit)
  const meetings: MeetingRecordingRow[] = []
  let matched = 0
  for (const t of list) {
    const row = await ingestFirefliesTranscript(t)
    meetings.push(row)
    if (row.lead_id || row.contact_id) matched += 1
  }
  return {
    synced: meetings.length,
    matched,
    meetings: meetings.map((m) => toMeetingDto(m, false)),
  }
}
