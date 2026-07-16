import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import {
  isCalBookingsReady,
  listCalBookingsWithLeads,
} from '@/lib/marketing/cal-bookings'
import { getCalWebhookFilterConfig } from '@/lib/marketing/cal-bookings-webhook'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const period = (req.query.period as string) || currentPeriod
  const debug = req.query.debug === '1' || req.query.debug === 'true'

  const ready = await isCalBookingsReady()
  if (!ready) {
    return res.status(200).json({
      bookings: [],
      period,
      configured: false,
      table_missing: true,
      debug: debug
        ? {
            filter: getCalWebhookFilterConfig(),
            hint: 'Ejecuta prisma/CREATE_CAL_BOOKINGS.sql en PostgreSQL',
          }
        : undefined,
    })
  }

  try {
    const bookings = await listCalBookingsWithLeads(period)

    let debugInfo: Record<string, unknown> | undefined
    if (debug) {
      const { rows: recent } = await query<{
        uid: string
        title: string | null
        status: string
        event_type_slug: string | null
        attendee_email: string | null
        booked_at: Date
        trigger_event: string | null
      }>(
        `SELECT uid, title, status, event_type_slug, attendee_email, booked_at, trigger_event
         FROM cal_bookings
         ORDER BY booked_at DESC
         LIMIT 10`
      )
      const { rows: countRows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM cal_bookings`
      )
      debugInfo = {
        filter: getCalWebhookFilterConfig(),
        total_in_db: parseInt(countRows[0]?.count || '0', 10),
        period_count: bookings.length,
        recent_all_periods: recent.map((r) => ({
          uid: r.uid,
          title: r.title,
          status: r.status,
          slug: r.event_type_slug,
          email: r.attendee_email,
          trigger: r.trigger_event,
          booked_at: r.booked_at?.toISOString?.() || r.booked_at,
        })),
      }
    }

    return res.status(200).json({
      bookings,
      period,
      configured: true,
      debug: debugInfo,
    })
  } catch (err) {
    console.error('[api/marketing/cal-bookings GET]', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Error al cargar reservas Cal.com',
      configured: true,
    })
  }
}
