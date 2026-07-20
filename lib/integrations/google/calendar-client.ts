import { google, type calendar_v3 } from 'googleapis'
import { getGoogleOAuth2Client } from '@/lib/integrations/google/oauth'
import {
  decryptConnectionTokens,
  getConnectionByOwner,
  markNeedsReauth,
  updateAccessToken,
} from '@/lib/integrations/google/store'

export class GoogleReauthRequiredError extends Error {
  constructor(message = 'Reconexión necesaria') {
    super(message)
    this.name = 'GoogleReauthRequiredError'
  }
}

export async function getAuthorizedCalendarClient(ownerKey: string) {
  const row = await getConnectionByOwner(ownerKey)
  if (!row) throw new GoogleReauthRequiredError('Google Calendar no está conectado')
  if (row.needs_reauth) throw new GoogleReauthRequiredError('Reconexión necesaria')

  const { accessToken, refreshToken } = decryptConnectionTokens(row)
  if (!refreshToken) throw new GoogleReauthRequiredError('Reconexión necesaria')

  const auth = getGoogleOAuth2Client()
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: row.expiry_date ? row.expiry_date.getTime() : undefined,
  })

  // Renovar access_token si falta o expira en < 60s
  const expiresAt = row.expiry_date?.getTime() ?? 0
  const needsRefresh = !accessToken || expiresAt < Date.now() + 60_000

  if (needsRefresh) {
    try {
      const refreshed = await auth.refreshAccessToken()
      const creds = refreshed.credentials
      const newAccess = creds.access_token
      if (!newAccess) throw new Error('Sin access_token tras refresh')
      await updateAccessToken(
        ownerKey,
        newAccess,
        creds.expiry_date ? new Date(creds.expiry_date) : null,
        creds.refresh_token || null
      )
      auth.setCredentials({
        access_token: newAccess,
        refresh_token: creds.refresh_token || refreshToken,
        expiry_date: creds.expiry_date,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('invalid_grant') || msg.toLowerCase().includes('invalid_grant')) {
        await markNeedsReauth(ownerKey)
        throw new GoogleReauthRequiredError('Reconexión necesaria')
      }
      throw e
    }
  }

  const calendar = google.calendar({ version: 'v3', auth })
  return { calendar, auth, googleEmail: row.google_email }
}

export type CalendarEventDTO = {
  id: string
  title: string
  description: string | null
  location: string | null
  htmlLink: string | null
  hangoutLink: string | null
  meetLink: string | null
  allDay: boolean
  start: string
  end: string
  timeZone: string
  status: string | null
  recurringEventId: string | null
  organizerEmail: string | null
  organizerSelf: boolean
  attendees: { email: string; displayName: string | null; self: boolean }[]
}

function meetFromEvent(ev: calendar_v3.Schema$Event): string | null {
  const hangout = ev.hangoutLink || null
  const entry =
    ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || null
  return hangout || entry
}

export async function listPrimaryCalendarEvents(params: {
  ownerKey: string
  timeMin: string
  timeMax: string
}): Promise<CalendarEventDTO[]> {
  const { calendar } = await getAuthorizedCalendarClient(params.ownerKey)
  const timeZone = 'Europe/Madrid'
  const out: CalendarEventDTO[] = []
  let pageToken: string | undefined

  do {
    try {
      const res = await calendar.events.list({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        timeMin: params.timeMin,
        timeMax: params.timeMax,
        timeZone,
        maxResults: 250,
        pageToken,
      })

      for (const ev of res.data.items || []) {
        if (!ev.id) continue
        const allDay = Boolean(ev.start?.date && !ev.start?.dateTime)
        const start = ev.start?.dateTime || ev.start?.date || ''
        const end = ev.end?.dateTime || ev.end?.date || ''
        out.push({
          id: ev.id,
          title: ev.summary || '(Sin título)',
          description: ev.description || null,
          location: ev.location || null,
          htmlLink: ev.htmlLink || null,
          hangoutLink: ev.hangoutLink || null,
          meetLink: meetFromEvent(ev),
          allDay,
          start,
          end,
          timeZone,
          status: ev.status || null,
          recurringEventId: ev.recurringEventId || null,
          organizerEmail: ev.organizer?.email || null,
          organizerSelf: Boolean(ev.organizer?.self),
          attendees: (ev.attendees || [])
            .filter((a) => a.email)
            .map((a) => ({
              email: String(a.email),
              displayName: a.displayName || null,
              self: Boolean(a.self),
            })),
        })
      }
      pageToken = res.data.nextPageToken || undefined
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const status =
        typeof e === 'object' && e && 'code' in e ? Number((e as { code?: number }).code) : 0
      if (msg.includes('invalid_grant') || status === 401) {
        await markNeedsReauth(params.ownerKey)
        throw new GoogleReauthRequiredError('Reconexión necesaria')
      }
      throw e
    }
  } while (pageToken)

  return out
}
