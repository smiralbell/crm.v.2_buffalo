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

declare global {
  // eslint-disable-next-line no-var
  var __buffaloFirefliesRematchAt: number | undefined
}

const REMATCH_MIN_GAP_MS = 5 * 60_000

/**
 * Vuelve a intentar vincular las reuniones que quedaron pendientes: con todos los correos
 * de la reunión (invitados, organizador, anfitrión), releídos de lo que mandó Fireflies, y
 * con los leads y correos extra que existan ahora. Así una reunión que llegó antes de que
 * se diera de alta el lead se vincula sola después. No llama a Fireflies.
 */
export async function rematchPendingMeetings(opts: { force?: boolean; limit?: number } = {}): Promise<{ checked: number; linked: number }> {
  const now = Date.now()
  if (!opts.force && globalThis.__buffaloFirefliesRematchAt && now - globalThis.__buffaloFirefliesRematchAt < REMATCH_MIN_GAP_MS) {
    return { checked: 0, linked: 0 }
  }
  globalThis.__buffaloFirefliesRematchAt = now

  const { prisma } = await import('@/lib/prisma')
  const rows = await prisma.$queryRawUnsafe<{ id: string; fireflies_id: string; raw_payload: unknown }[]>(
    `SELECT id::text, fireflies_id, raw_payload FROM meeting_recordings
      WHERE status = 'pending_match' AND lead_id IS NULL
      ORDER BY COALESCE(started_at, created_at) DESC
      LIMIT $1`,
    Math.min(Math.max(opts.limit ?? 100, 1), 300)
  )
  let linked = 0
  for (const r of rows) {
    try {
      const raw = r.raw_payload && typeof r.raw_payload === 'object' ? (r.raw_payload as FirefliesTranscript) : null
      if (raw) {
        await prisma.$executeRawUnsafe(
          `UPDATE meeting_recordings SET participants = $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`,
          r.id,
          JSON.stringify(extractParticipants(raw))
        )
      }
      const row = await getMeetingByFirefliesId(r.fireflies_id)
      if (!row || row.status === 'ignored') continue
      const routed = await routeFirefliesMeeting(row)
      if (routed.action === 'contact_ficha') linked += 1
    } catch (e) {
      console.warn('[fireflies/rematch]', r.fireflies_id, e instanceof Error ? e.message : e)
    }
  }
  return { checked: rows.length, linked }
}
