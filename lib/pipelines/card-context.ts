import { prisma } from '@/lib/prisma'
import { isCalBookingsTableAvailable } from '@/lib/marketing/cal-bookings'
import { query } from '@/lib/db'
import { listMeetingsForLead } from '@/lib/integrations/fireflies/store'
import type {
  PipelineCardContext,
  PipelineTimelineItem,
  PipelineUpcomingMeeting,
} from '@/lib/pipelines/card-context.types'

export type {
  PipelineCardContext,
  PipelineTimelineItem,
  PipelineUpcomingMeeting,
} from '@/lib/pipelines/card-context.types'

const ORIGEN_LABELS: Record<string, string> = {
  web: 'Web',
  website: 'Web',
  landing: 'Landing',
  formulario_web: 'Formulario web',
  web_form: 'Formulario web',
  web_chat: 'Chat web',
  chat_web: 'Chat web',
  chat_widget: 'Chat widget',
  cold_calling: 'Cold calling',
  coldcall: 'Cold calling',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  referral: 'Referido',
  referido: 'Referido',
  cal: 'Cal.com',
  calcom: 'Cal.com',
}

const CANAL_LABELS: Record<string, string> = {
  web: 'Web',
  chat_web: 'Chat web',
  widget: 'Widget',
  formulario_web: 'Formulario web',
  web_chat: 'Chat web',
  web_form: 'Formulario web',
  form: 'Formulario',
  whatsapp: 'WhatsApp',
  email: 'Email',
  instagram: 'Instagram',
  telefono: 'Teléfono',
  phone: 'Teléfono',
}

function humanizeOrigen(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const key = raw.trim().toLowerCase()
  return ORIGEN_LABELS[key] || raw.trim()
}

function humanizeCanal(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const key = raw.trim().toLowerCase()
  return CANAL_LABELS[key] || raw.trim()
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function calendarHrefFor(startIso: string): string {
  const day = startIso.slice(0, 10)
  return day ? `/calendario?date=${encodeURIComponent(day)}` : '/calendario'
}

type CalRow = {
  uid: string
  title: string | null
  status: string
  start_time: Date | null
  end_time: Date | null
  booked_at: Date
}

async function listCalBookingsForEmail(email: string): Promise<CalRow[]> {
  if (!(await isCalBookingsTableAvailable())) return []
  try {
    const { rows } = await query<CalRow>(
      `SELECT uid, title, status, start_time, end_time, booked_at
       FROM cal_bookings
       WHERE attendee_email IS NOT NULL
         AND LOWER(TRIM(attendee_email)) = LOWER(TRIM($1))
         AND COALESCE(status, '') NOT IN ('cancelled', 'canceled', 'rejected')
       ORDER BY COALESCE(start_time, booked_at) DESC
       LIMIT 40`,
      [email]
    )
    return rows
  } catch {
    return []
  }
}

async function loadProyectoForLead(leadId: number) {
  try {
    const rows = await prisma.$queryRaw<
      { id: string; name: string; status: string; created_at: Date | null }[]
    >`
      SELECT id::text AS id, name, status, created_at
      FROM proyectos
      WHERE lead_id = ${leadId}
      LIMIT 1
    `
    const p = rows[0]
    if (!p) return null
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      created_at: toIso(p.created_at),
    }
  } catch {
    return null
  }
}

/**
 * Contexto lateral del drawer de pipeline: reunión próxima + historial del lead.
 * entity_id del pipeline CRM = contact_id.
 */
export async function getPipelineCardContext(contactId: number): Promise<PipelineCardContext | null> {
  if (!Number.isFinite(contactId) || contactId <= 0) return null

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      leads: { orderBy: { created_at: 'desc' }, take: 1 },
      messages: {
        orderBy: { timestamp: 'asc' },
        take: 1,
        select: { canal: true, timestamp: true },
      },
    },
  })

  if (!contact) return null

  const lead = contact.leads[0] ?? null
  const firstMsg = contact.messages[0] ?? null
  const email = contact.email?.trim() || null
  const origen = lead?.origen_principal?.trim() || null
  const canal = firstMsg?.canal?.trim() || null

  const timeline: PipelineTimelineItem[] = []

  const leadCreatedAt = toIso(lead?.created_at) || toIso(contact.created_at)
  if (leadCreatedAt) {
    const origenLabel = humanizeOrigen(origen)
    timeline.push({
      id: `origin-${lead?.id ?? contactId}`,
      kind: 'origin',
      title: 'Entró en el CRM',
      detail: origenLabel ? `Origen: ${origenLabel}` : 'Origen no indicado',
      at: leadCreatedAt,
    })
  }

  if (canal && firstMsg?.timestamp) {
    const canalLabel = humanizeCanal(canal)
    const msgAt = toIso(firstMsg.timestamp)
    if (msgAt && canalLabel) {
      const origenNorm = (origen || '').toLowerCase()
      const canalNorm = canal.toLowerCase()
      if (!origenNorm || (!origenNorm.includes(canalNorm) && !canalNorm.includes(origenNorm))) {
        timeline.push({
          id: `channel-${contactId}`,
          kind: 'channel',
          title: 'Primer contacto',
          detail: `Canal: ${canalLabel}`,
          at: msgAt,
        })
      }
    }
  }

  const calRows = email ? await listCalBookingsForEmail(email) : []
  const now = Date.now()
  let upcoming: PipelineUpcomingMeeting | null = null

  for (const b of calRows) {
    const startIso = toIso(b.start_time)
    const bookedIso = toIso(b.booked_at)
    if (bookedIso) {
      timeline.push({
        id: `cal-booked-${b.uid}`,
        kind: 'meeting_booked',
        title: 'Reunión agendada',
        detail: b.title || 'Cal.com',
        at: bookedIso,
      })
    }
    if (startIso) {
      const startMs = new Date(startIso).getTime()
      if (startMs <= now) {
        timeline.push({
          id: `cal-done-${b.uid}`,
          kind: 'meeting_done',
          title: 'Reunión realizada',
          detail: b.title
            ? `${b.title} · ${new Date(startIso).toLocaleString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : new Date(startIso).toLocaleString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
          at: startIso,
        })
      } else if (!upcoming || new Date(startIso).getTime() < new Date(upcoming.start_time).getTime()) {
        upcoming = {
          title: b.title,
          start_time: startIso,
          end_time: toIso(b.end_time),
          status: b.status,
          source: 'cal_booking',
          calendar_href: calendarHrefFor(startIso),
        }
      }
    }
  }

  if (lead?.id) {
    try {
      const fireflies = await listMeetingsForLead(lead.id)
      for (const m of fireflies) {
        const at = toIso(m.started_at) || toIso(m.created_at)
        if (!at) continue
        timeline.push({
          id: `ff-${m.id}`,
          kind: 'meeting_done',
          title: 'Reunión (Fireflies)',
          detail: m.title || 'Grabación vinculada',
          at,
        })
      }
    } catch {
      // tabla puede no existir
    }
  }

  const proyecto = lead?.id ? await loadProyectoForLead(lead.id) : null
  if (proyecto) {
    const at = proyecto.created_at || leadCreatedAt
    if (at) {
      timeline.push({
        id: `project-${proyecto.id}`,
        kind: 'project',
        title: 'Proyecto definido',
        detail: proyecto.name || proyecto.status,
        at,
      })
    }
  } else if (lead?.configuracion?.trim()) {
    const at = toIso(lead.updated_at) || leadCreatedAt
    if (at) {
      timeline.push({
        id: `config-${lead.id}`,
        kind: 'project',
        title: 'Configuración de proyecto guardada',
        detail: 'Pendiente de sincronizar a proyectos',
        at,
      })
    }
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  // Deduplicate near-identical meeting_done entries (same day + similar title)
  const seen = new Set<string>()
  const deduped: PipelineTimelineItem[] = []
  for (const item of timeline) {
    const day = item.at.slice(0, 10)
    const key = `${item.kind}:${day}:${(item.detail || item.title).slice(0, 40).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  return {
    contact_id: contactId,
    lead_id: lead?.id ?? null,
    email,
    telefono: contact.telefono,
    origen_principal: humanizeOrigen(origen),
    canal: humanizeCanal(canal),
    lead_created_at: leadCreatedAt,
    upcoming_meeting: upcoming,
    timeline: deduped.slice(0, 20),
    proyecto,
  }
}
