import { prisma } from '@/lib/prisma'
import { listOpenAlerts, type CrmActivityRow } from '@/lib/crm/activities'
import { countPendingWebFormSubmissions, isWebFormSubmissionsTableAvailable } from '@/lib/marketing/web-form-submissions'
import {
  FORMACION_INTENT_LABELS,
  listRecentFormacionDiagnosticos,
} from '@/lib/marketing/formacion-diagnosticos'

export type DashboardAlertItem = {
  id: string
  source: 'manual' | 'meeting' | 'form'
  severity: 'info' | 'warn' | 'bad'
  title: string
  message: string
  client_name: string | null
  at: string
  href: string | null
  /** Solo alertas manuales: id en crm_activities para resolver */
  activity_id?: string
  calendar_href?: string | null
}

function calendarHrefFor(startIso: string): string {
  const day = startIso.slice(0, 10)
  return day ? `/calendario?date=${encodeURIComponent(day)}` : '/calendario'
}

function relativeMeetingLabel(start: Date, now: Date): string {
  const ms = start.getTime() - now.getTime()
  const hours = Math.round(ms / (1000 * 60 * 60))
  if (hours <= 0) return 'Ahora / en breve'
  if (hours < 24) return `En ${hours} h`
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24))
  if (days === 1) return 'Mañana'
  return `En ${days} días`
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

async function loadManualAlerts(): Promise<DashboardAlertItem[]> {
  const alerts = await listOpenAlerts({ limit: 80 })
  if (alerts.length === 0) return []

  const contactIds = Array.from(new Set(alerts.map((a) => a.contact_id)))
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: {
      id: true,
      nombre: true,
      empresa: true,
      leads: { select: { id: true }, take: 1 },
    },
  })
  const byContact = new Map(contacts.map((c) => [c.id, c]))

  return alerts.map((a: CrmActivityRow) => {
    const c = byContact.get(a.contact_id)
    const leadId = a.lead_id || c?.leads[0]?.id || null
    const client =
      c?.nombre?.trim() || c?.empresa?.trim() || (leadId ? `Lead #${leadId}` : `Contacto #${a.contact_id}`)
    const at = a.due_at || a.created_at
    return {
      id: `alert-${a.id}`,
      source: 'manual' as const,
      severity: 'warn' as const,
      title: a.title,
      message: a.body || 'Alerta pendiente',
      client_name: client,
      at,
      href: leadId ? `/leads/${leadId}` : `/contacts/${a.contact_id}`,
      activity_id: a.id,
    }
  })
}

type CalUpcomingRow = {
  uid: string
  title: string | null
  status: string
  start_time: Date
  attendee_name: string | null
  attendee_email: string | null
  contact_id: number | null
  lead_id: number | null
}

async function loadMeetingAlerts(withinDays = 2): Promise<DashboardAlertItem[]> {
  const now = new Date()
  const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000)
  try {
    const rows = await prisma.$queryRawUnsafe<CalUpcomingRow[]>(
      `SELECT
         b.uid,
         b.title,
         b.status,
         b.start_time,
         b.attendee_name,
         b.attendee_email,
         c.id AS contact_id,
         l.id AS lead_id
       FROM cal_bookings b
       LEFT JOIN contacts c
         ON c.email IS NOT NULL
        AND LOWER(TRIM(c.email)) = LOWER(TRIM(b.attendee_email))
       LEFT JOIN leads l ON l.contact_id = c.id
       WHERE b.start_time IS NOT NULL
         AND b.start_time >= $1
         AND b.start_time <= $2
         AND COALESCE(b.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
       ORDER BY b.start_time ASC
       LIMIT 40`,
      now,
      until
    )

    return rows.map((r) => {
      const startIso = r.start_time.toISOString()
      const href = r.lead_id
        ? `/leads/${r.lead_id}`
        : r.contact_id
          ? `/contacts/${r.contact_id}`
          : calendarHrefFor(startIso)
      return {
        id: `meeting-${r.uid}`,
        source: 'meeting' as const,
        severity: 'info' as const,
        title: r.title?.trim() || 'Reunión próxima',
        message: `${relativeMeetingLabel(r.start_time, now)} · ${r.start_time.toLocaleString('es-ES', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}`,
        client_name: r.attendee_name?.trim() || r.attendee_email || null,
        at: startIso,
        href,
        calendar_href: calendarHrefFor(startIso),
      }
    })
  } catch {
    return []
  }
}

async function loadFormAlerts(): Promise<DashboardAlertItem[]> {
  const period = currentPeriod()
  const periodQs = `?period=${encodeURIComponent(period)}`
  const href = `/marketing/web/formularios${periodQs}`
  const items: DashboardAlertItem[] = []

  try {
    const recent = await listRecentFormacionDiagnosticos(3, 20)
    for (const r of recent) {
      const intentLabel = FORMACION_INTENT_LABELS[r.intent]
      items.push({
        id: `formacion-${r.id}`,
        source: 'form',
        severity: 'warn',
        title: `Nueva respuesta · Formación (${intentLabel})`,
        message: r.objetivo
          ? r.objetivo.slice(0, 140) + (r.objetivo.length > 140 ? '…' : '')
          : `${r.email}${r.telefono ? ` · ${r.telefono}` : ''}`,
        client_name: [r.nombre, r.empresa].filter(Boolean).join(' · ') || null,
        at: r.created_at,
        href,
      })
    }
  } catch {
    /* ignore */
  }

  try {
    if (await isWebFormSubmissionsTableAvailable()) {
      const pending = await countPendingWebFormSubmissions(period)
      if (pending > 0) {
        items.push({
          id: 'web-forms-pending',
          source: 'form',
          severity: pending >= 3 ? 'bad' : 'warn',
          title: `${pending} formulario${pending > 1 ? 's' : ''} web pendiente${pending > 1 ? 's' : ''}`,
          message: 'Hay envíos de la web sin marcar como contactados.',
          client_name: null,
          at: new Date().toISOString(),
          href,
        })
      }
    }
  } catch {
    /* ignore */
  }

  return items
}

/** Alertas manuales + reuniones próximas + respuestas de formularios. */
export async function getDashboardAlerts(withinDays = 2): Promise<DashboardAlertItem[]> {
  const [manual, meetings, forms] = await Promise.all([
    loadManualAlerts(),
    loadMeetingAlerts(withinDays),
    loadFormAlerts(),
  ])
  const rank = { bad: 0, warn: 1, info: 2 }
  return [...manual, ...meetings, ...forms].sort((a, b) => {
    const sr = rank[a.severity] - rank[b.severity]
    if (sr !== 0) return sr
    return new Date(b.at).getTime() - new Date(a.at).getTime()
  })
}
