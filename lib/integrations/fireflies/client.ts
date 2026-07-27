import { createHmac, timingSafeEqual } from 'crypto'

export const FIREFLIES_GRAPHQL_URL = 'https://api.fireflies.ai/graphql'

export type FirefliesParticipant = {
  email: string | null
  name: string | null
}

export type FirefliesSummary = {
  keywords?: string[] | null
  action_items?: string | string[] | null
  outline?: string | null
  shorthand_bullet?: string | null
  overview?: string | null
  bullet_gist?: string | null
  gist?: string | null
  short_summary?: string | null
  short_overview?: string | null
  meeting_type?: string | null
  topics_discussed?: string[] | null
}

export type FirefliesTranscript = {
  id: string
  title: string | null
  date: number | null
  dateString: string | null
  duration: number | null
  host_email: string | null
  organizer_email: string | null
  participants: string[] | null
  transcript_url: string | null
  meeting_link: string | null
  meeting_attendees?: {
    displayName?: string | null
    email?: string | null
    name?: string | null
  }[] | null
  speakers?: { id?: string | null; name?: string | null }[] | null
  sentences?: {
    index?: number
    speaker_name?: string | null
    text?: string | null
    raw_text?: string | null
  }[] | null
  summary?: FirefliesSummary | null
}

const TRANSCRIPT_FIELDS = `
  id
  title
  date
  dateString
  duration
  host_email
  organizer_email
  participants
  transcript_url
  meeting_link
  meeting_attendees {
    displayName
    email
    name
  }
  speakers {
    id
    name
  }
  sentences {
    index
    speaker_name
    text
    raw_text
  }
  summary {
    keywords
    action_items
    outline
    shorthand_bullet
    overview
    bullet_gist
    gist
    short_summary
    short_overview
    meeting_type
    topics_discussed
  }
`

function getApiKey(): string {
  const key = process.env.FIREFLIES_API_KEY?.trim()
  if (!key) {
    throw new Error('FIREFLIES_API_KEY no está configurada')
  }
  return key
}

export function isFirefliesConfigured(): boolean {
  return Boolean(process.env.FIREFLIES_API_KEY?.trim())
}

async function firefliesGraphql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(FIREFLIES_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = (await res.json()) as {
    data?: T
    errors?: { message?: string }[]
  }

  if (!res.ok) {
    throw new Error(`Fireflies HTTP ${res.status}: ${JSON.stringify(json.errors || json)}`)
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message || 'error').join('; '))
  }
  if (!json.data) {
    throw new Error('Fireflies: respuesta sin data')
  }
  return json.data
}

export async function fetchFirefliesTranscript(id: string): Promise<FirefliesTranscript | null> {
  const data = await firefliesGraphql<{ transcript: FirefliesTranscript | null }>(
    `query Transcript($transcriptId: String!) {
      transcript(id: $transcriptId) { ${TRANSCRIPT_FIELDS} }
    }`,
    { transcriptId: id }
  )
  return data.transcript
}

export async function fetchRecentFirefliesTranscripts(limit = 20): Promise<FirefliesTranscript[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50)
  const data = await firefliesGraphql<{ transcripts: FirefliesTranscript[] }>(
    `query Transcripts($limit: Int) {
      transcripts(limit: $limit) { ${TRANSCRIPT_FIELDS} }
    }`,
    { limit: safeLimit }
  )
  return data.transcripts || []
}

export function formatTranscriptText(t: FirefliesTranscript): string | null {
  const sentences = t.sentences
  if (!sentences?.length) return null
  return sentences
    .map((s) => {
      const speaker = (s.speaker_name || 'Speaker').trim()
      const text = (s.text || s.raw_text || '').trim()
      if (!text) return null
      return `${speaker}: ${text}`
    })
    .filter(Boolean)
    .join('\n')
}

export function pickSummaryOverview(summary: FirefliesSummary | null | undefined): string | null {
  if (!summary) return null
  const candidates = [
    summary.overview,
    summary.short_overview,
    summary.short_summary,
    summary.gist,
    summary.bullet_gist,
    summary.shorthand_bullet,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

export function pickActionItems(summary: FirefliesSummary | null | undefined): string | null {
  if (!summary?.action_items) return null
  if (Array.isArray(summary.action_items)) {
    const lines = summary.action_items.map((x) => String(x).trim()).filter(Boolean)
    return lines.length ? lines.join('\n') : null
  }
  const s = String(summary.action_items).trim()
  return s || null
}

export function extractParticipants(t: FirefliesTranscript): FirefliesParticipant[] {
  const byEmail = new Map<string, FirefliesParticipant>()
  const add = (email: string | null | undefined, name: string | null | undefined) => {
    const e = email?.trim().toLowerCase() || null
    const n = name?.trim() || null
    if (!e && !n) return
    if (e) {
      const prev = byEmail.get(e)
      byEmail.set(e, { email: e, name: n || prev?.name || null })
    } else if (n) {
      byEmail.set(`name:${n.toLowerCase()}`, { email: null, name: n })
    }
  }

  for (const a of t.meeting_attendees || []) {
    add(a.email, a.displayName || a.name)
  }
  for (const p of t.participants || []) {
    if (typeof p === 'string' && p.includes('@')) add(p, null)
  }
  add(t.host_email, null)
  add(t.organizer_email, null)

  return Array.from(byEmail.values())
}

export function startedAtFromTranscript(t: FirefliesTranscript): Date | null {
  if (t.dateString) {
    const d = new Date(t.dateString)
    if (!Number.isNaN(d.getTime())) return d
  }
  if (typeof t.date === 'number' && t.date > 0) {
    // Fireflies date is often ms since epoch
    const ms = t.date < 1e12 ? t.date * 1000 : t.date
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

function normalizeSignature(header: string): string {
  let value = header.trim()
  if (value.toLowerCase().startsWith('sha256=')) value = value.slice(7)
  return value.toLowerCase()
}

/** Verifica X-Hub-Signature (HMAC-SHA256 del body). Sin secret configurado → acepta (dev). */
export function verifyFirefliesWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET?.trim()
  if (!secret) return true
  if (!signatureHeader?.trim()) return false

  const received = normalizeSignature(signatureHeader)
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  if (expected === received) return true
  if (expected.length !== received.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'))
  } catch {
    return false
  }
}
