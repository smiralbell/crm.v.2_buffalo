import { prisma } from '@/lib/prisma'
import type { FirefliesParticipant } from '@/lib/integrations/fireflies/client'

export type MeetingRecordingStatus = 'pending_match' | 'matched' | 'ignored'

export type MeetingRecordingRow = {
  id: string
  fireflies_id: string
  title: string | null
  meeting_link: string | null
  transcript_url: string | null
  host_email: string | null
  organizer_email: string | null
  participants: FirefliesParticipant[]
  started_at: Date | null
  duration_minutes: number | null
  transcript: string | null
  summary_overview: string | null
  summary_action_items: string | null
  summary_json: unknown
  status: MeetingRecordingStatus
  match_reason: string | null
  lead_id: number | null
  contact_id: number | null
  fireflies_synced_at: Date | null
  created_at: Date
  updated_at: Date
}

let ensured = false

export async function ensureMeetingRecordingsTable(): Promise<void> {
  if (ensured) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meeting_recordings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fireflies_id TEXT NOT NULL UNIQUE,
      title TEXT,
      meeting_link TEXT,
      transcript_url TEXT,
      host_email TEXT,
      organizer_email TEXT,
      participants JSONB NOT NULL DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ,
      duration_minutes DOUBLE PRECISION,
      transcript TEXT,
      summary_overview TEXT,
      summary_action_items TEXT,
      summary_json JSONB,
      status TEXT NOT NULL DEFAULT 'pending_match',
      match_reason TEXT,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      raw_payload JSONB,
      fireflies_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meeting_recordings_lead_id ON meeting_recordings (lead_id)`
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meeting_recordings_contact_id ON meeting_recordings (contact_id)`
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meeting_recordings_started_at ON meeting_recordings (started_at)`
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meeting_recordings_status ON meeting_recordings (status)`
  )
  ensured = true
}

function parseParticipants(raw: unknown): FirefliesParticipant[] {
  if (!Array.isArray(raw)) return []
  return raw.map((p) => {
    const row = p as { email?: string | null; name?: string | null }
    return {
      email: row.email ? String(row.email).toLowerCase() : null,
      name: row.name ? String(row.name) : null,
    }
  })
}

function mapRow(r: Record<string, unknown>): MeetingRecordingRow {
  return {
    id: String(r.id),
    fireflies_id: String(r.fireflies_id),
    title: (r.title as string) ?? null,
    meeting_link: (r.meeting_link as string) ?? null,
    transcript_url: (r.transcript_url as string) ?? null,
    host_email: (r.host_email as string) ?? null,
    organizer_email: (r.organizer_email as string) ?? null,
    participants: parseParticipants(r.participants),
    started_at: r.started_at ? new Date(r.started_at as string | Date) : null,
    duration_minutes: r.duration_minutes != null ? Number(r.duration_minutes) : null,
    transcript: (r.transcript as string) ?? null,
    summary_overview: (r.summary_overview as string) ?? null,
    summary_action_items: (r.summary_action_items as string) ?? null,
    summary_json: r.summary_json ?? null,
    status: (r.status as MeetingRecordingStatus) || 'pending_match',
    match_reason: (r.match_reason as string) ?? null,
    lead_id: r.lead_id != null ? Number(r.lead_id) : null,
    contact_id: r.contact_id != null ? Number(r.contact_id) : null,
    fireflies_synced_at: r.fireflies_synced_at
      ? new Date(r.fireflies_synced_at as string | Date)
      : null,
    created_at: new Date(r.created_at as string | Date),
    updated_at: new Date(r.updated_at as string | Date),
  }
}

export type UpsertMeetingInput = {
  firefliesId: string
  title: string | null
  meetingLink: string | null
  transcriptUrl: string | null
  hostEmail: string | null
  organizerEmail: string | null
  participants: FirefliesParticipant[]
  startedAt: Date | null
  durationMinutes: number | null
  transcript: string | null
  summaryOverview: string | null
  summaryActionItems: string | null
  summaryJson: unknown
  rawPayload: unknown
  leadId?: number | null
  contactId?: number | null
  status?: MeetingRecordingStatus
  matchReason?: string | null
}

export async function upsertMeetingRecording(input: UpsertMeetingInput): Promise<MeetingRecordingRow> {
  await ensureMeetingRecordingsTable()

  const participantsJson = JSON.stringify(input.participants)
  const summaryJson = input.summaryJson != null ? JSON.stringify(input.summaryJson) : null
  const rawPayload = input.rawPayload != null ? JSON.stringify(input.rawPayload) : null
  const now = new Date()

  const existing = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM meeting_recordings WHERE fireflies_id = $1 LIMIT 1`,
    input.firefliesId
  )
  const prev = existing[0] ? mapRow(existing[0]) : null

  const keepManualLink = prev?.status === 'matched' && prev.lead_id != null && !input.status
  const leadId = keepManualLink
    ? prev!.lead_id
    : input.leadId !== undefined
      ? input.leadId
      : prev?.lead_id ?? null
  const contactId = keepManualLink
    ? prev!.contact_id
    : input.contactId !== undefined
      ? input.contactId
      : prev?.contact_id ?? null
  const status: MeetingRecordingStatus = keepManualLink
    ? 'matched'
    : input.status || (leadId ? 'matched' : 'pending_match')
  const matchReason = keepManualLink
    ? prev!.match_reason
    : input.matchReason !== undefined
      ? input.matchReason
      : prev?.match_reason ?? null

  const transcript = input.transcript || prev?.transcript || null
  const summaryOverview = input.summaryOverview || prev?.summary_overview || null
  const summaryActionItems = input.summaryActionItems || prev?.summary_action_items || null

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO meeting_recordings (
      fireflies_id, title, meeting_link, transcript_url, host_email, organizer_email,
      participants, started_at, duration_minutes, transcript, summary_overview,
      summary_action_items, summary_json, status, match_reason, lead_id, contact_id,
      raw_payload, fireflies_synced_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7::jsonb, $8, $9, $10, $11,
      $12, $13::jsonb, $14, $15, $16, $17,
      $18::jsonb, $19, $20, $21
    )
    ON CONFLICT (fireflies_id) DO UPDATE SET
      title = COALESCE(EXCLUDED.title, meeting_recordings.title),
      meeting_link = COALESCE(EXCLUDED.meeting_link, meeting_recordings.meeting_link),
      transcript_url = COALESCE(EXCLUDED.transcript_url, meeting_recordings.transcript_url),
      host_email = COALESCE(EXCLUDED.host_email, meeting_recordings.host_email),
      organizer_email = COALESCE(EXCLUDED.organizer_email, meeting_recordings.organizer_email),
      participants = EXCLUDED.participants,
      started_at = COALESCE(EXCLUDED.started_at, meeting_recordings.started_at),
      duration_minutes = COALESCE(EXCLUDED.duration_minutes, meeting_recordings.duration_minutes),
      transcript = COALESCE(EXCLUDED.transcript, meeting_recordings.transcript),
      summary_overview = COALESCE(EXCLUDED.summary_overview, meeting_recordings.summary_overview),
      summary_action_items = COALESCE(EXCLUDED.summary_action_items, meeting_recordings.summary_action_items),
      summary_json = COALESCE(EXCLUDED.summary_json, meeting_recordings.summary_json),
      status = EXCLUDED.status,
      match_reason = EXCLUDED.match_reason,
      lead_id = EXCLUDED.lead_id,
      contact_id = EXCLUDED.contact_id,
      raw_payload = COALESCE(EXCLUDED.raw_payload, meeting_recordings.raw_payload),
      fireflies_synced_at = EXCLUDED.fireflies_synced_at,
      updated_at = EXCLUDED.updated_at
    `,
    input.firefliesId,
    input.title,
    input.meetingLink,
    input.transcriptUrl,
    input.hostEmail,
    input.organizerEmail,
    participantsJson,
    input.startedAt,
    input.durationMinutes,
    transcript,
    summaryOverview,
    summaryActionItems,
    summaryJson,
    status,
    matchReason,
    leadId,
    contactId,
    rawPayload,
    now,
    now,
    now
  )

  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM meeting_recordings WHERE fireflies_id = $1 LIMIT 1`,
    input.firefliesId
  )
  return mapRow(rows[0])
}

export async function getMeetingById(id: string): Promise<MeetingRecordingRow | null> {
  await ensureMeetingRecordingsTable()
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM meeting_recordings WHERE id = $1::uuid LIMIT 1`,
    id
  )
  return rows[0] ? mapRow(rows[0]) : null
}

export async function getMeetingByFirefliesId(
  firefliesId: string
): Promise<MeetingRecordingRow | null> {
  await ensureMeetingRecordingsTable()
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM meeting_recordings WHERE fireflies_id = $1 LIMIT 1`,
    firefliesId
  )
  return rows[0] ? mapRow(rows[0]) : null
}

export async function listMeetingsForLead(leadId: number): Promise<MeetingRecordingRow[]> {
  await ensureMeetingRecordingsTable()
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM meeting_recordings
     WHERE lead_id = $1
     ORDER BY COALESCE(started_at, created_at) DESC`,
    leadId
  )
  return rows.map(mapRow)
}

export async function listMeetingsForContact(
  contactId: number
): Promise<MeetingRecordingRow[]> {
  await ensureMeetingRecordingsTable()
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM meeting_recordings
     WHERE contact_id = $1
     ORDER BY COALESCE(started_at, created_at) DESC`,
    contactId
  )
  return rows.map(mapRow)
}

export async function listUnmatchedMeetings(limit = 50): Promise<MeetingRecordingRow[]> {
  await ensureMeetingRecordingsTable()
  const safe = Math.min(Math.max(limit, 1), 200)
  // Solo pendientes reales (sin lead). Contact-only (matched + contact_id) no aparece aquí.
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM meeting_recordings
     WHERE status = 'pending_match'
       AND lead_id IS NULL
     ORDER BY COALESCE(started_at, created_at) DESC
     LIMIT $1`,
    safe
  )
  return rows.map(mapRow)
}

export async function listRecentMeetings(limit = 40): Promise<MeetingRecordingRow[]> {
  await ensureMeetingRecordingsTable()
  const safe = Math.min(Math.max(limit, 1), 200)
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM meeting_recordings
     ORDER BY COALESCE(started_at, created_at) DESC
     LIMIT $1`,
    safe
  )
  return rows.map(mapRow)
}

export async function linkMeetingToLead(
  meetingId: string,
  leadId: number,
  contactId: number | null,
  reason = 'manual'
): Promise<MeetingRecordingRow | null> {
  await ensureMeetingRecordingsTable()
  await prisma.$executeRawUnsafe(
    `UPDATE meeting_recordings
     SET lead_id = $2,
         contact_id = $3,
         status = 'matched',
         match_reason = $4,
         updated_at = NOW()
     WHERE id = $1::uuid`,
    meetingId,
    leadId,
    contactId,
    reason
  )
  return getMeetingById(meetingId)
}

export async function unlinkMeeting(meetingId: string): Promise<MeetingRecordingRow | null> {
  await ensureMeetingRecordingsTable()
  await prisma.$executeRawUnsafe(
    `UPDATE meeting_recordings
     SET lead_id = NULL,
         contact_id = NULL,
         status = 'pending_match',
         match_reason = NULL,
         updated_at = NOW()
     WHERE id = $1::uuid`,
    meetingId
  )
  return getMeetingById(meetingId)
}

export async function ignoreMeeting(meetingId: string): Promise<MeetingRecordingRow | null> {
  await ensureMeetingRecordingsTable()
  await prisma.$executeRawUnsafe(
    `UPDATE meeting_recordings
     SET status = 'ignored',
         updated_at = NOW()
     WHERE id = $1::uuid`,
    meetingId
  )
  return getMeetingById(meetingId)
}

export function toMeetingDto(row: MeetingRecordingRow, includeTranscript = false) {
  return {
    id: row.id,
    fireflies_id: row.fireflies_id,
    title: row.title,
    meeting_link: row.meeting_link,
    transcript_url: row.transcript_url,
    host_email: row.host_email,
    organizer_email: row.organizer_email,
    participants: row.participants,
    started_at: row.started_at?.toISOString() ?? null,
    duration_minutes: row.duration_minutes,
    summary_overview: row.summary_overview,
    summary_action_items: row.summary_action_items,
    transcript: includeTranscript ? row.transcript : undefined,
    has_transcript: Boolean(row.transcript),
    status: row.status,
    match_reason: row.match_reason,
    lead_id: row.lead_id,
    contact_id: row.contact_id,
    fireflies_synced_at: row.fireflies_synced_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}
