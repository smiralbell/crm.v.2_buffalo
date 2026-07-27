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
import { matchLeadFromParticipants } from '@/lib/integrations/fireflies/match'
import {
  getMeetingByFirefliesId,
  toMeetingDto,
  upsertMeetingRecording,
  type MeetingRecordingRow,
} from '@/lib/integrations/fireflies/store'

export async function ingestFirefliesTranscript(
  t: FirefliesTranscript,
  opts?: { forceRematch?: boolean }
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
    existing.status === 'pending_match'

  if (shouldMatch && existing?.status !== 'ignored') {
    const match = await matchLeadFromParticipants(participants)
    if (match) {
      leadId = match.leadId
      contactId = match.contactId
      status = 'matched'
      matchReason = match.reason
    } else if (!existing?.lead_id) {
      leadId = null
      contactId = null
      status = 'pending_match'
      matchReason = null
    }
  }

  return upsertMeetingRecording({
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
    if (row.lead_id) matched += 1
  }
  return {
    synced: meetings.length,
    matched,
    meetings: meetings.map((m) => toMeetingDto(m, false)),
  }
}
