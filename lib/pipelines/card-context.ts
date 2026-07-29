import { prisma } from '@/lib/prisma'
import { isCalBookingsTableAvailable } from '@/lib/marketing/cal-bookings'
import { query } from '@/lib/db'
import { listMeetingsForLead } from '@/lib/integrations/fireflies/store'
import { buildProjectViewData } from '@/lib/onboarding/project-view'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import type {
  PipelineCardContext,
  PipelineProjectContext,
  PipelineTimelineItem,
  PipelineUpcomingMeeting,
} from '@/lib/pipelines/card-context.types'

export type {
  PipelineCardContext,
  PipelineProjectContext,
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

type ProyectoBrief = {
  id: string
  name: string
  status: string
  created_at: string | null
  service_type: string | null
  setup_fee_eur: number | null
  monthly_fee_eur: number | null
}

async function loadProyectoForLead(leadId: number): Promise<ProyectoBrief | null> {
  try {
    const rows = await prisma.$queryRaw<
      {
        id: string
        name: string
        status: string
        created_at: Date | null
        service_type: string | null
        setup_fee_eur: number | null
        monthly_fee_eur: number | null
      }[]
    >`
      SELECT
        id::text AS id,
        name,
        status,
        created_at,
        service_type,
        setup_fee_eur,
        monthly_fee_eur
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
      service_type: p.service_type,
      setup_fee_eur: p.setup_fee_eur != null ? Number(p.setup_fee_eur) : null,
      monthly_fee_eur: p.monthly_fee_eur != null ? Number(p.monthly_fee_eur) : null,
    }
  } catch {
    return null
  }
}

async function loadDevOnboarding(proyectoId: string) {
  try {
    const rows = await prisma.$queryRaw<
      {
        summary: string | null
        client_context: string | null
        scope_text: string | null
        internal_notes: string | null
      }[]
    >`
      SELECT summary, client_context, scope_text, internal_notes
      FROM project_dev_onboarding
      WHERE project_id = ${proyectoId}::uuid
      LIMIT 1
    `
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function loadRetentionExcerpt(proyectoId: string): Promise<{
  excerpt: string | null
  status: string | null
}> {
  try {
    const rows = await prisma.$queryRaw<
      { audit_knowledge: string | null; audit_status: string | null }[]
    >`
      SELECT audit_knowledge, audit_status
      FROM retencion_agent_configs
      WHERE proyecto_id = ${proyectoId}::uuid
      LIMIT 1
    `
    const row = rows[0]
    if (!row?.audit_knowledge?.trim()) {
      return { excerpt: null, status: row?.audit_status ?? null }
    }
    return {
      excerpt: extractRetentionBrief(row.audit_knowledge),
      status: row.audit_status,
    }
  } catch {
    return { excerpt: null, status: null }
  }
}

/** Prefer Identität + Producto sections; fall back to truncated doc. */
function extractRetentionBrief(md: string, maxLen = 1400): string {
  const sections = ['Identidad y cliente', 'Producto contratado', 'Comercial / mensualidad']
  const parts: string[] = []
  for (const title of sections) {
    const re = new RegExp(`##\\s+${title}[\\s\\S]*?(?=\\n##\\s+|$)`, 'i')
    const m = md.match(re)
    if (m?.[0]?.trim()) parts.push(m[0].trim())
  }
  const joined = parts.length ? parts.join('\n\n') : md.trim()
  if (joined.length <= maxLen) return joined
  return `${joined.slice(0, maxLen).trim()}…`
}

function emptyProjectContext(): PipelineProjectContext {
  return {
    has_any: false,
    title: null,
    description: null,
    mode: null,
    status: null,
    services: [],
    setup_eur: null,
    monthly_eur: null,
    monthly_label: null,
    lead_notas: null,
    onboarding_notes: null,
    onboarding_summary: null,
    scope_text: null,
    last_meeting_summary: null,
    last_meeting_title: null,
    retention_excerpt: null,
    retention_status: null,
    hrefs: { onboarding: null, retencion: null, gestion: null },
  }
}

async function buildProjectContext(input: {
  contactId: number
  lead: {
    id: number
    notas: string | null
    configuracion: string | null
    valor: unknown
  } | null
  proyecto: ProyectoBrief | null
}): Promise<PipelineProjectContext> {
  const ctx = emptyProjectContext()
  if (!input.lead) return ctx

  const lead = input.lead
  const valor = lead.valor != null ? Number(lead.valor) : null
  const view = buildProjectViewData(lead.configuracion, valor, lead.notas)
  const cfg = view.cfg || parseConfiguradorConfig(lead.configuracion)

  ctx.lead_notas = lead.notas?.trim() || null
  ctx.services = view.services
  ctx.setup_eur =
    view.setupTotal > 0
      ? view.setupTotal
      : input.proyecto?.setup_fee_eur ?? (cfg?.setup_total_eur != null ? Number(cfg.setup_total_eur) : null)
  ctx.monthly_eur = view.maintMonthly ?? input.proyecto?.monthly_fee_eur ?? null
  ctx.monthly_label = view.maintLabel
  ctx.mode = cfg?.mode === 'custom' || cfg?.mode === 'packaged' ? cfg.mode : null
  ctx.onboarding_notes = cfg?.onboarding_notes?.trim() || null

  if (cfg?.mode === 'custom') {
    ctx.title = cfg.title?.trim() || input.proyecto?.name || null
    ctx.description = cfg.description?.trim() || null
    if (cfg.scope_items?.length) {
      ctx.scope_text = cfg.scope_items.map((s) => `• ${s}`).join('\n')
    }
  } else {
    ctx.title =
      input.proyecto?.name ||
      (view.services.length ? view.services.join(' + ') : null) ||
      cfg?.empresa?.trim() ||
      null
    ctx.description = null
  }

  ctx.status = input.proyecto?.status ?? null
  ctx.hrefs.onboarding = `/onboarding?lead=${input.contactId}`

  if (input.proyecto) {
    ctx.hrefs.gestion = `/gestion-proyecto/proyectos/${input.proyecto.id}`
    ctx.hrefs.retencion = `/retencion/proyectos/${input.proyecto.id}?tab=configurar`

    const onboarding = await loadDevOnboarding(input.proyecto.id)
    if (onboarding) {
      ctx.onboarding_summary = onboarding.summary?.trim() || onboarding.client_context?.trim() || null
      if (!ctx.scope_text) ctx.scope_text = onboarding.scope_text?.trim() || null
      if (!ctx.description && onboarding.client_context?.trim()) {
        ctx.description = onboarding.client_context.trim()
      }
    }

    const retention = await loadRetentionExcerpt(input.proyecto.id)
    ctx.retention_excerpt = retention.excerpt
    ctx.retention_status = retention.status
  }

  ctx.has_any = Boolean(
    ctx.title ||
      ctx.description ||
      ctx.services.length ||
      ctx.lead_notas ||
      ctx.onboarding_notes ||
      ctx.onboarding_summary ||
      ctx.scope_text ||
      ctx.last_meeting_summary ||
      ctx.retention_excerpt ||
      ctx.setup_eur ||
      ctx.monthly_eur
  )

  return ctx
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

  let lastMeetingSummary: string | null = null
  let lastMeetingTitle: string | null = null

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
        if (!lastMeetingSummary && m.summary_overview?.trim()) {
          const overview = m.summary_overview.trim()
          lastMeetingTitle = m.title
          lastMeetingSummary =
            overview.length > 600 ? `${overview.slice(0, 600).trim()}…` : overview
        }
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

  const project_context = lead
    ? await buildProjectContext({
        contactId,
        lead: {
          id: lead.id,
          notas: lead.notas,
          configuracion: lead.configuracion,
          valor: lead.valor,
        },
        proyecto,
      })
    : emptyProjectContext()

  if (lastMeetingSummary) {
    project_context.last_meeting_summary = lastMeetingSummary
    project_context.last_meeting_title = lastMeetingTitle
    project_context.has_any = true
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
    proyecto: proyecto
      ? {
          id: proyecto.id,
          name: proyecto.name,
          status: proyecto.status,
          created_at: proyecto.created_at,
        }
      : null,
    project_context,
  }
}
