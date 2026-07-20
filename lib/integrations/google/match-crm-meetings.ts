import { prisma } from '@/lib/prisma'
import { isCalBookingsTableAvailable } from '@/lib/marketing/cal-bookings'
import { query } from '@/lib/db'
import type { CalendarEventDTO } from '@/lib/integrations/google/calendar-client'

export type CrmProjectLink = {
  id: string
  name: string
  status: string
  es_buffalo: boolean
  href: string
}

export type CrmMeetingLink = {
  match: 'high' | 'medium' | 'low'
  reason: string
  source: 'email' | 'coldcall' | 'cal_booking' | 'lead'
  lead_id: number | null
  prospect_id: number | null
  cal_uid: string | null
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: string | null
  at: string | null
  campaign_name: string | null
  notas: string | null
  lead_href: string | null
  reuniones_href: string | null
  proyectos: CrmProjectLink[]
}

export type CalendarEventWithCrm = CalendarEventDTO & {
  attendees: { email: string; displayName: string | null; self?: boolean }[]
  crm: CrmMeetingLink | null
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const WINDOW_MS = 90 * 60 * 1000

function normEmail(e: string | null | undefined): string | null {
  if (!e) return null
  const v = e.trim().toLowerCase()
  return v.includes('@') ? v : null
}

function extractEmailsFromText(...parts: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const part of parts) {
    if (!part) continue
    const matches = part.match(EMAIL_RE) || []
    for (const m of matches) {
      const n = normEmail(m)
      if (n) set.add(n)
    }
  }
  return Array.from(set)
}

/** Todos los correos útiles del evento Google (asistentes, organizador, título, descripción…). */
export function collectEventEmails(ev: CalendarEventDTO): string[] {
  const set = new Set<string>()
  for (const a of ev.attendees || []) {
    if (a.self) continue
    const n = normEmail(a.email)
    if (n) set.add(n)
  }
  const org = normEmail(ev.organizerEmail)
  if (org && !ev.organizerSelf) set.add(org)

  for (const n of extractEmailsFromText(ev.title, ev.description, ev.location)) {
    set.add(n)
  }
  return Array.from(set)
}

type LeadRow = {
  lead_id: number
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string
  estado: string | null
}

async function findLeadsByEmails(emails: string[]): Promise<Map<string, LeadRow>> {
  const map = new Map<string, LeadRow>()
  if (emails.length === 0) return map

  const contacts = await prisma.contact.findMany({
    where: {
      OR: emails.map((email) => ({
        email: { equals: email, mode: 'insensitive' as const },
      })),
    },
    include: {
      leads: { take: 1, orderBy: { updated_at: 'desc' } },
    },
  })

  for (const ct of contacts) {
    const email = normEmail(ct.email)
    const lead = ct.leads[0]
    if (!email || !lead || map.has(email)) continue
    map.set(email, {
      lead_id: lead.id,
      nombre: ct.nombre || email,
      empresa: ct.empresa,
      telefono: ct.telefono,
      email,
      estado: lead.estado,
    })
  }
  return map
}

async function loadProyectosForLeads(leadIds: number[]): Promise<Map<number, CrmProjectLink[]>> {
  const map = new Map<number, CrmProjectLink[]>()
  if (leadIds.length === 0) return map

  const { Prisma } = await import('@prisma/client')
  const rows = await prisma.$queryRaw<
    {
      id: string
      lead_id: number
      name: string
      status: string
      es_buffalo: boolean
    }[]
  >`
    SELECT
      id::text AS id,
      lead_id,
      name,
      status,
      COALESCE(es_buffalo, FALSE) AS es_buffalo
    FROM proyectos
    WHERE lead_id IN (${Prisma.join(leadIds)})
    ORDER BY updated_at DESC NULLS LAST
  `

  for (const r of rows) {
    if (r.lead_id == null) continue
    const list = map.get(r.lead_id) || []
    list.push({
      id: r.id,
      name: r.name,
      status: r.status,
      es_buffalo: Boolean(r.es_buffalo),
      href: r.es_buffalo
        ? `/gestion-proyecto/proyectos/${r.id}`
        : `/onboarding/proyectos/${r.id}`,
    })
    map.set(r.lead_id, list)
  }
  return map
}

type TimedCandidate = {
  source: 'coldcall' | 'cal_booking'
  lead_id: number | null
  prospect_id: number | null
  cal_uid: string | null
  email: string | null
  at: Date
  campaign_name: string | null
  notas: string | null
  nombre: string
  empresa: string | null
  telefono: string | null
}

async function loadTimedCandidates(from: Date, to: Date): Promise<TimedCandidate[]> {
  const padFrom = new Date(from.getTime() - 2 * 24 * 60 * 60 * 1000)
  const padTo = new Date(to.getTime() + 2 * 24 * 60 * 60 * 1000)
  const out: TimedCandidate[] = []

  const cold = await prisma.$queryRaw<
    {
      prospect_id: number
      nombre: string
      empresa: string | null
      email: string | null
      telefono: string | null
      at: Date
      notas: string | null
      campaign_name: string | null
      lead_id: number | null
    }[]
  >`
    SELECT
      p.id AS prospect_id,
      p.nombre,
      p.empresa,
      p.email,
      p.telefono,
      lc.reunion_fecha AS at,
      lc.notas,
      camp.name AS campaign_name,
      l.id AS lead_id
    FROM coldcall_prospects p
    LEFT JOIN coldcall_campaigns camp ON camp.id = p.campaign_id
    INNER JOIN LATERAL (
      SELECT reunion_fecha, notas
      FROM coldcall_calls
      WHERE prospect_id = p.id AND resultado = 'reunion_agendada'
      ORDER BY fecha DESC
      LIMIT 1
    ) lc ON TRUE
    LEFT JOIN contacts ct ON p.email IS NOT NULL
      AND ct.email IS NOT NULL
      AND LOWER(TRIM(ct.email)) = LOWER(TRIM(p.email))
    LEFT JOIN leads l ON l.contact_id = ct.id
    WHERE p.deleted_at IS NULL
      AND lc.reunion_fecha IS NOT NULL
      AND lc.reunion_fecha >= ${padFrom}
      AND lc.reunion_fecha <= ${padTo}
    LIMIT 500
  `

  for (const r of cold) {
    const at = r.at instanceof Date ? r.at : new Date(r.at)
    if (Number.isNaN(at.getTime())) continue
    out.push({
      source: 'coldcall',
      lead_id: r.lead_id,
      prospect_id: r.prospect_id,
      cal_uid: null,
      email: r.email,
      at,
      campaign_name: r.campaign_name,
      notas: r.notas,
      nombre: r.nombre,
      empresa: r.empresa,
      telefono: r.telefono,
    })
  }

  if (await isCalBookingsTableAvailable()) {
    try {
      const { rows } = await query<{
        uid: string
        title: string | null
        start_time: Date
        attendee_name: string | null
        attendee_email: string | null
        lead_id: number | null
        empresa: string | null
        telefono: string | null
      }>(
        `SELECT
           b.uid,
           b.title,
           b.start_time,
           b.attendee_name,
           b.attendee_email,
           l.id AS lead_id,
           ct.empresa,
           ct.telefono
         FROM cal_bookings b
         LEFT JOIN contacts ct
           ON b.attendee_email IS NOT NULL
          AND ct.email IS NOT NULL
          AND LOWER(TRIM(ct.email)) = LOWER(TRIM(b.attendee_email))
         LEFT JOIN leads l ON l.contact_id = ct.id
         WHERE b.start_time IS NOT NULL
           AND b.start_time >= $1
           AND b.start_time <= $2
           AND COALESCE(b.status, '') NOT IN ('cancelled', 'canceled')
         LIMIT 500`,
        [padFrom, padTo]
      )
      for (const r of rows) {
        const at = r.start_time instanceof Date ? r.start_time : new Date(r.start_time)
        if (Number.isNaN(at.getTime())) continue
        out.push({
          source: 'cal_booking',
          lead_id: r.lead_id,
          prospect_id: null,
          cal_uid: r.uid,
          email: r.attendee_email,
          at,
          campaign_name: null,
          notas: r.title,
          nombre: r.attendee_name || r.title || 'Reserva Cal.com',
          empresa: r.empresa,
          telefono: r.telefono,
        })
      }
    } catch {
      // tabla o columnas distintas
    }
  }

  return out
}

function parseEventStart(ev: CalendarEventDTO): Date | null {
  if (!ev.start) return null
  const d = new Date(ev.start.includes('T') ? ev.start : `${ev.start}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Cruza eventos Google → lead por email → proyectos del lead.
 */
export async function attachCrmMeetingsToEvents(
  events: CalendarEventDTO[],
  range: { timeMin: string; timeMax: string }
): Promise<CalendarEventWithCrm[]> {
  if (events.length === 0) return []

  const from = new Date(range.timeMin)
  const to = new Date(range.timeMax)

  const allEmails = new Set<string>()
  const emailsByEvent = new Map<string, string[]>()
  for (const ev of events) {
    const emails = collectEventEmails(ev)
    emailsByEvent.set(ev.id, emails)
    for (const e of emails) allEmails.add(e)
  }

  const [leadByEmail, timed] = await Promise.all([
    findLeadsByEmails(Array.from(allEmails)),
    Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())
      ? Promise.resolve([] as TimedCandidate[])
      : loadTimedCandidates(from, to),
  ])

  const leadIds = new Set<number>()
  for (const lead of Array.from(leadByEmail.values())) leadIds.add(lead.lead_id)
  for (const t of timed) {
    if (t.lead_id) leadIds.add(t.lead_id)
  }

  const proyectosByLead = await loadProyectosForLeads(Array.from(leadIds))

  return events.map((ev) => {
    const attendees = ev.attendees || []
    const emails = emailsByEvent.get(ev.id) || []
    const start = parseEventStart(ev)

    let best: CrmMeetingLink | null = null
    let bestScore = -1

    // 1) Prioridad: email del evento → lead CRM
    for (const email of emails) {
      const lead = leadByEmail.get(email)
      if (!lead) continue

      const timedHit = timed.find((t) => {
        const te = normEmail(t.email)
        if (te !== email) return false
        if (!start) return false
        return Math.abs(start.getTime() - t.at.getTime()) <= WINDOW_MS
      })

      const score = timedHit ? 100 : 90
      if (score <= bestScore) continue

      bestScore = score
      best = {
        match: 'high',
        reason: timedHit
          ? 'Mismo email que el lead + misma hora de reunión en CRM'
          : 'Email del evento = email del lead en el CRM',
        source: timedHit ? timedHit.source : 'email',
        lead_id: lead.lead_id,
        prospect_id: timedHit?.prospect_id ?? null,
        cal_uid: timedHit?.cal_uid ?? null,
        nombre: lead.nombre,
        empresa: lead.empresa,
        email: lead.email,
        telefono: lead.telefono,
        estado: lead.estado,
        at: timedHit ? timedHit.at.toISOString() : null,
        campaign_name: timedHit?.campaign_name ?? null,
        notas: timedHit?.notas ?? null,
        lead_href: `/leads/${lead.lead_id}`,
        reuniones_href: timedHit?.prospect_id ? '/comercial/reuniones' : null,
        proyectos: proyectosByLead.get(lead.lead_id) || [],
      }
    }

    // 2) Fallback: reunión timed sin email en Google pero con lead_id
    if (!best && start) {
      for (const t of timed) {
        if (!t.lead_id) continue
        if (Math.abs(start.getTime() - t.at.getTime()) > WINDOW_MS) continue
        const score = 50
        if (score <= bestScore) continue
        bestScore = score
        best = {
          match: 'medium',
          reason: 'Misma hora que una reunión agendada en CRM',
          source: t.source,
          lead_id: t.lead_id,
          prospect_id: t.prospect_id,
          cal_uid: t.cal_uid,
          nombre: t.nombre,
          empresa: t.empresa,
          email: t.email,
          telefono: t.telefono,
          estado: null,
          at: t.at.toISOString(),
          campaign_name: t.campaign_name,
          notas: t.notas,
          lead_href: `/leads/${t.lead_id}`,
          reuniones_href: t.prospect_id ? '/comercial/reuniones' : null,
          proyectos: proyectosByLead.get(t.lead_id) || [],
        }
      }
    }

    return {
      ...ev,
      attendees,
      crm: best,
    }
  })
}
