import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { googleOwnerKey } from '@/lib/integrations/google/owner'
import {
  GoogleReauthRequiredError,
  listPrimaryCalendarEvents,
} from '@/lib/integrations/google/calendar-client'
import { attachCrmMeetingsToEvents } from '@/lib/integrations/google/match-crm-meetings'
import { ensureGoogleConnectionsTable } from '@/lib/integrations/google/store'

const querySchema = z.object({
  timeMin: z.string().min(1),
  timeMax: z.string().min(1),
})

/**
 * GET /api/integrations/google/calendar/events?timeMin=&timeMax=
 * Incluye cruce con reuniones CRM (cold call, Cal.com, leads).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await requireAuthAPI(req, res)
    await ensureGoogleConnectionsTable()

    const parsed = querySchema.safeParse({
      timeMin: req.query.timeMin,
      timeMax: req.query.timeMax,
    })
    if (!parsed.success) {
      return res.status(400).json({ error: 'timeMin y timeMax son obligatorios (ISO)' })
    }

    const ownerKey = googleOwnerKey(user)
    const raw = await listPrimaryCalendarEvents({
      ownerKey,
      timeMin: parsed.data.timeMin,
      timeMax: parsed.data.timeMax,
    })

    let events
    try {
      events = await attachCrmMeetingsToEvents(raw, {
        timeMin: parsed.data.timeMin,
        timeMax: parsed.data.timeMax,
      })
    } catch (matchErr) {
      console.warn('[google/calendar/events] CRM match skipped', matchErr)
      events = raw.map((ev) => ({ ...ev, crm: null }))
    }

    return res.status(200).json({
      timeZone: 'Europe/Madrid',
      events,
    })
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'No session' || e.message === 'Invalid session' || e.message === 'Expired session')
    ) {
      return
    }
    if (e instanceof GoogleReauthRequiredError) {
      return res.status(401).json({ error: 'Reconexión necesaria', needs_reauth: true })
    }
    console.error('[google/calendar/events]', e)
    return res.status(500).json({
      error: e instanceof Error ? e.message : 'Error al listar eventos',
    })
  }
}
