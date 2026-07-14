import { query } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import type { CalBookingRow, CalBookingStatus } from '@/lib/marketing/cal-bookings.types'
import {
  DEFAULT_CAL_EVENT_SLUG,
  DEFAULT_CAL_LINK,
  type ParsedCalWebhookBooking,
} from '@/lib/marketing/cal-bookings-webhook'

export { DEFAULT_CAL_EVENT_SLUG, DEFAULT_CAL_LINK }

type DbRow = {
  uid: string
  title: string | null
  status: string
  start_time: Date | null
  end_time: Date | null
  duration_minutes: number | null
  booked_at: Date
  attendee_name: string | null
  attendee_email: string | null
  location: string | null
  event_type_slug: string | null
}

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  return { start, end }
}

function inPeriod(iso: string, period: string): boolean {
  const { start, end } = periodBounds(period)
  const d = new Date(iso)
  return d >= start && d <= end
}

function mapDbRow(row: DbRow): CalBookingRow {
  const start = row.start_time?.toISOString() || ''
  const end = row.end_time?.toISOString() || ''

  return {
    uid: row.uid,
    title: row.title || 'Reunión',
    status: row.status as CalBookingStatus,
    start,
    end,
    duration: row.duration_minutes ?? 0,
    created_at: row.booked_at.toISOString(),
    attendee_name: row.attendee_name,
    attendee_email: row.attendee_email,
    location: row.location,
    event_type: row.event_type_slug,
    cal_url: `https://cal.com/bookings/${row.uid}`,
    lead_id: null,
    lead_estado: null,
    lead_origen: null,
    empresa: null,
    telefono: null,
  }
}

export async function isCalBookingsTableAvailable(): Promise<boolean> {
  try {
    await query(`SELECT 1 FROM cal_bookings LIMIT 1`)
    return true
  } catch {
    return false
  }
}

export async function isCalBookingsReady(): Promise<boolean> {
  return isCalBookingsTableAvailable()
}

export async function upsertCalBookingFromWebhook(input: ParsedCalWebhookBooking): Promise<void> {
  await query(
    `INSERT INTO cal_bookings (
       uid, trigger_event, title, status, start_time, end_time, duration_minutes,
       attendee_name, attendee_email, location, event_type_slug, event_type_id,
       payload, booked_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13::jsonb, $14, NOW()
     )
     ON CONFLICT (uid) DO UPDATE SET
       trigger_event = EXCLUDED.trigger_event,
       title = EXCLUDED.title,
       status = EXCLUDED.status,
       start_time = EXCLUDED.start_time,
       end_time = EXCLUDED.end_time,
       duration_minutes = EXCLUDED.duration_minutes,
       attendee_name = EXCLUDED.attendee_name,
       attendee_email = EXCLUDED.attendee_email,
       location = EXCLUDED.location,
       event_type_slug = EXCLUDED.event_type_slug,
       event_type_id = EXCLUDED.event_type_id,
       payload = EXCLUDED.payload,
       booked_at = LEAST(cal_bookings.booked_at, EXCLUDED.booked_at),
       updated_at = NOW()`,
    [
      input.uid,
      input.trigger_event,
      input.title,
      input.status,
      input.start_time,
      input.end_time,
      input.duration_minutes,
      input.attendee_name,
      input.attendee_email,
      input.location,
      input.event_type_slug,
      input.event_type_id,
      JSON.stringify(input.payload),
      input.booked_at,
    ]
  )
}

export async function listCalBookings(period: string, limit = 100): Promise<CalBookingRow[]> {
  if (!(await isCalBookingsTableAvailable())) return []

  const result = await query<DbRow>(
    `SELECT uid, title, status, start_time, end_time, duration_minutes, booked_at,
            attendee_name, attendee_email, location, event_type_slug
     FROM cal_bookings
     ORDER BY booked_at DESC
     LIMIT $1`,
    [Math.max(limit * 3, 300)]
  )

  return result.rows
    .map(mapDbRow)
    .filter((r) => inPeriod(r.created_at, period))
    .slice(0, limit)
}

export async function countCalBookings(period: string): Promise<number> {
  const rows = await listCalBookings(period, 500)
  return rows.filter((r) => r.status !== 'cancelled' && r.status !== 'rejected').length
}

export async function countUpcomingCalBookings(): Promise<number> {
  if (!(await isCalBookingsTableAvailable())) return 0

  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM cal_bookings
     WHERE start_time > NOW()
       AND status IN ('accepted', 'pending')`
  )

  return parseInt(result.rows[0]?.count || '0', 10)
}

async function enrichCalBookingsWithLeads(bookings: CalBookingRow[]): Promise<CalBookingRow[]> {
  const emails = [
    ...new Set(
      bookings
        .map((b) => b.attendee_email?.trim().toLowerCase())
        .filter((e): e is string => !!e)
    ),
  ]
  if (emails.length === 0) return bookings

  const contacts = await prisma.contact.findMany({
    where: {
      OR: emails.map((email) => ({
        email: { equals: email, mode: 'insensitive' as const },
      })),
    },
    include: {
      leads: {
        orderBy: { created_at: 'desc' },
        take: 1,
      },
    },
  })

  const byEmail = new Map<string, (typeof contacts)[number]>()
  for (const contact of contacts) {
    if (contact.email) byEmail.set(contact.email.toLowerCase(), contact)
  }

  return bookings.map((booking) => {
    const email = booking.attendee_email?.trim().toLowerCase()
    const contact = email ? byEmail.get(email) : undefined
    const lead = contact?.leads[0]

    return {
      ...booking,
      lead_id: lead?.id ?? null,
      lead_estado: lead?.estado ?? null,
      lead_origen: lead?.origen_principal ?? null,
      empresa: contact?.empresa ?? null,
      telefono: contact?.telefono ?? null,
    }
  })
}

export async function listCalBookingsWithLeads(period: string, limit = 100): Promise<CalBookingRow[]> {
  const bookings = await listCalBookings(period, limit)
  return enrichCalBookingsWithLeads(bookings)
}
