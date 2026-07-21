import { prisma } from '@/lib/prisma'

let tableReady = false

export async function ensureGoogleCalendarEventNotesTable(): Promise<void> {
  if (tableReady) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS google_calendar_event_notes (
      id SERIAL PRIMARY KEY,
      owner_key TEXT NOT NULL,
      event_id TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_key, event_id)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_google_calendar_event_notes_owner
      ON google_calendar_event_notes (owner_key, updated_at DESC)
  `)
  tableReady = true
}

export async function getEventNotesMap(
  ownerKey: string,
  eventIds: string[]
): Promise<Record<string, string>> {
  if (eventIds.length === 0) return {}
  await ensureGoogleCalendarEventNotesTable()

  const rows = await prisma.$queryRaw<{ event_id: string; notes: string | null }[]>`
    SELECT event_id, notes
    FROM google_calendar_event_notes
    WHERE owner_key = ${ownerKey}
      AND event_id = ANY(${eventIds}::text[])
  `

  const out: Record<string, string> = {}
  for (const row of rows) {
    if (row.notes?.trim()) out[row.event_id] = row.notes.trim()
  }
  return out
}

export async function saveEventNote(
  ownerKey: string,
  eventId: string,
  notes: string
): Promise<string> {
  await ensureGoogleCalendarEventNotesTable()
  const trimmed = notes.trim()

  if (!trimmed) {
    await prisma.$executeRaw`
      DELETE FROM google_calendar_event_notes
      WHERE owner_key = ${ownerKey} AND event_id = ${eventId}
    `
    return ''
  }

  await prisma.$executeRaw`
    INSERT INTO google_calendar_event_notes (owner_key, event_id, notes, updated_at)
    VALUES (${ownerKey}, ${eventId}, ${trimmed}, NOW())
    ON CONFLICT (owner_key, event_id)
    DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
  `
  return trimmed
}
