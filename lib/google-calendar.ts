import { google } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
]

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google-calendar/callback'
  )
}

export function getAuthUrl() {
  const client = getOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export async function getAuthorizedClient() {
  const client = getOAuth2Client()
  client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })
  return client
}

export interface MeetingParams {
  titulo:      string
  descripcion: string
  fechaInicio: Date
  duracionMin: number
  emailProspecto: string
  emailOrganizador: string
}

export async function createCalendarEvent(params: MeetingParams) {
  const auth = await getAuthorizedClient()
  const calendar = google.calendar({ version: 'v3', auth })

  const fechaFin = new Date(params.fechaInicio.getTime() + params.duracionMin * 60000)

  const event = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary: params.titulo,
      description: params.descripcion,
      start: { dateTime: params.fechaInicio.toISOString(), timeZone: 'Europe/Madrid' },
      end:   { dateTime: fechaFin.toISOString(),           timeZone: 'Europe/Madrid' },
      attendees: [
        { email: params.emailOrganizador },
        { email: params.emailProspecto },
      ],
      conferenceData: {
        createRequest: {
          requestId: `buffalo-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email',  minutes: 60 },
          { method: 'popup',  minutes: 15 },
        ],
      },
    },
  })

  const meetLink = event.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || ''
  const eventId = event.data.id || ''

  return { meetLink, eventId, event: event.data }
}
