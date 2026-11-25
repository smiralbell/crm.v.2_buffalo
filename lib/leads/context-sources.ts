import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { listActivities } from '@/lib/crm/activities'
import {
  listMeetingsByParticipantEmails,
  listMeetingsForContact,
  listMeetingsForLead,
} from '@/lib/integrations/fireflies/store'
import { listExtraEmails } from '@/lib/leads/lead-extras'
import { getMetaAttributionByLeadId } from '@/lib/integrations/meta/store'
import { listPersonaDocumentos } from '@/lib/leads/archivos'
import { listLinkedInvoices } from '@/lib/leads/facturas'
import { estadoLabel } from '@/lib/leads/estados'

/**
 * Todo lo que el CRM sabe de un lead, agrupado por fuente (conector).
 * Lo usan el mapa de contexto de la ficha, la exportación a Markdown y el resumen con IA.
 */

export type SourceId =
  | 'origen'
  | 'correos'
  | 'reuniones'
  | 'mensajes'
  | 'escrito'
  | 'notas'
  | 'documentos'
  | 'facturas'
  | 'proyecto'

export type SourceItem = {
  id: string
  title: string
  date: string | null
  body: string | null
  meta: { label: string; value: string }[]
  link: string | null
}

export type ContextSource = {
  id: SourceId
  label: string
  items: SourceItem[]
}

export type LeadContext = {
  lead: {
    id: number
    nombre: string
    empresa: string | null
    email: string | null
    /** Otros correos desde los que escribe el cliente */
    emails_extra: string[]
    telefono: string | null
    estado: string
    /** Tiene proyecto o facturas: ya es cliente aunque el estado no esté al día */
    es_cliente: boolean
    prioridad: string | null
    origen: string | null
    valor: number | null
    created_at: string
    updated_at: string
  }
  sources: ContextSource[]
}

/** Fuentes que cuentan como «contenido de valor» para el resumen (la entrada del lead no). */
export const VALUE_SOURCES: SourceId[] = [
  'correos',
  'reuniones',
  'mensajes',
  'escrito',
  'notas',
  'documentos',
  'facturas',
  'proyecto',
]

/** En estas fuentes solo cuenta que aparezca algo nuevo, no que cambie (las tareas cambian a diario). */
export const STABLE_SOURCES: SourceId[] = ['facturas', 'proyecto']

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null)

function metaPairs(pairs: [string, unknown][]): { label: string; value: string }[] {
  return pairs
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([label, v]) => ({ label, value: String(v) }))
}

type ProyectoRow = {
  id: string
  name: string
  status: string
  service_type: string | null
  updated_at: Date
  fecha_inicio_real: Date | null
  fecha_fin_real: Date | null
  ob_summary: string | null
  ob_context: string | null
  ob_scope: string | null
  ob_deliverables: string | null
  ob_notes: string | null
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

export async function collectLeadContext(
  leadId: number,
  opts: { includePrices: boolean }
): Promise<LeadContext | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      estado: true,
      prioridad: true,
      origen_principal: true,
      valor: true,
      notas: true,
      created_at: true,
      updated_at: true,
      contact_id: true,
      contact: { select: { nombre: true, empresa: true, email: true, telefono: true } },
    },
  })
  if (!lead) return null
  const c = lead.contact

  const extraEmails = await safe(() => listExtraEmails(leadId), [] as string[])
  const allEmails = [c.email, ...extraEmails].filter((e): e is string => Boolean(e))

  const [activities, meetingsLead, meetingsContact, meetingsByEmail, meta, messages, documentos, facturas, proyectos] = await Promise.all([
    safe(() => listActivities({ contactId: lead.contact_id, limit: 200 }), []),
    safe(() => listMeetingsForLead(leadId), []),
    safe(() => listMeetingsForContact(lead.contact_id), []),
    safe(() => listMeetingsByParticipantEmails(allEmails), []),
    safe(() => getMetaAttributionByLeadId(leadId), null),
    safe(
      () =>
        query<{ id: number; canal: string; direccion: string; contenido: string; timestamp: Date | null }>(
          `SELECT id, canal, direccion, contenido, timestamp FROM messages
            WHERE contact_id = $1 ORDER BY timestamp DESC NULLS LAST LIMIT 150`,
          [lead.contact_id]
        ).then((r) => r.rows),
      [] as { id: number; canal: string; direccion: string; contenido: string; timestamp: Date | null }[]
    ),
    safe(() => listPersonaDocumentos(leadId), []),
    opts.includePrices ? safe(() => listLinkedInvoices(leadId), []) : Promise.resolve([]),
    safe(
      () =>
        query<ProyectoRow>(
          `SELECT p.id::text, p.name, p.status, p.service_type, p.updated_at,
                  p.fecha_inicio_real, p.fecha_fin_real,
                  o.summary AS ob_summary, o.client_context AS ob_context, o.scope_text AS ob_scope,
                  o.deliverables AS ob_deliverables, o.internal_notes AS ob_notes
             FROM proyectos p
             LEFT JOIN project_dev_onboarding o ON o.project_id = p.id
            WHERE p.lead_id = $1
            ORDER BY p.updated_at DESC`,
          [leadId]
        ).then((r) => r.rows),
      [] as ProyectoRow[]
    ),
  ])

  const projectIds = proyectos.map((p) => p.id)
  const [tareas, tickets] = await Promise.all([
    projectIds.length
      ? safe(
          () =>
            query<{ project_id: string; title: string; status: string; assignee: string | null; updated_at: Date }>(
              `SELECT project_id::text, title, status, assignee, updated_at FROM project_dev_tasks
                WHERE project_id = ANY($1::uuid[]) ORDER BY updated_at DESC LIMIT 200`,
              [projectIds]
            ).then((r) => r.rows),
          [] as { project_id: string; title: string; status: string; assignee: string | null; updated_at: Date }[]
        )
      : Promise.resolve([]),
    projectIds.length
      ? safe(
          () =>
            query<{ project_id: string; title: string; status: string; priority: string; created_at: Date }>(
              `SELECT project_id::text, title, status, priority, created_at FROM tickets
                WHERE project_id = ANY($1::uuid[]) ORDER BY created_at DESC LIMIT 60`,
              [projectIds]
            ).then((r) => r.rows),
          [] as { project_id: string; title: string; status: string; priority: string; created_at: Date }[]
        )
      : Promise.resolve([]),
  ])

  // Origen: por dónde entró
  const origenBody = meta
    ? metaPairs([
        ['Campaña', meta.campaign_name],
        ['Conjunto de anuncios', meta.adset_name],
        ['Anuncio', meta.ad_name],
        ['Formulario', meta.form_name],
        ['Página', meta.page_name],
        ['Plataforma', meta.platform],
      ])
        .map((m) => `${m.label}: ${m.value}`)
        .join('\n')
    : null
  const origen: SourceItem[] = [
    {
      id: 'entrada',
      title: lead.origen_principal ? `Entró por ${lead.origen_principal}` : 'Canal de entrada sin indicar',
      date: iso(lead.created_at),
      body: origenBody,
      meta: metaPairs([
        ['Estado', estadoLabel(lead.estado)],
        ['Prioridad', lead.prioridad],
      ]),
      link: null,
    },
  ]

  const correos: SourceItem[] = activities
    .filter((a) => a.kind === 'email')
    .map((a) => {
      const m = (a.meta || {}) as Record<string, unknown>
      return {
        id: String(a.id),
        title: a.title,
        date: iso(a.created_at),
        body: a.body,
        meta: metaPairs([
          ['Dirección', m.direction === 'out' ? 'Enviado por Buffalo' : m.direction === 'in' ? 'Recibido' : null],
          ['De', m.from],
          ['Para', m.to],
        ]),
        link: null,
      }
    })

  const seen = new Set<string>()
  const presenciales: SourceItem[] = activities
    .filter((a) => a.kind === 'meeting')
    .map((a) => {
      const m = (a.meta || {}) as Record<string, unknown>
      return {
        id: `act-${a.id}`,
        title: a.title,
        date: iso((m.fecha as string) || a.created_at),
        body: a.body,
        meta: metaPairs([
          ['Tipo', m.presencial ? 'Presencial' : 'Reunión'],
          ['Origen', m.transcrita ? 'Audio transcrito' : 'Notas escritas'],
          ['Por', a.created_by],
        ]),
        link: null,
      }
    })

  const firefliesItems: SourceItem[] = [...meetingsLead, ...meetingsContact, ...meetingsByEmail]
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .map((m) => ({
      id: m.id,
      title: m.title || 'Reunión',
      date: iso(m.started_at || m.created_at),
      body: [m.summary_overview, m.summary_action_items ? `Próximos pasos:\n${m.summary_action_items}` : null]
        .filter(Boolean)
        .join('\n\n') || null,
      meta: metaPairs([
        ['Duración', m.duration_minutes ? `${m.duration_minutes} min` : null],
        ['Participantes', (m.participants || []).map((p) => p.name || p.email).filter(Boolean).join(', ')],
      ]),
      link: m.transcript_url,
    }))
  const reuniones: SourceItem[] = [...presenciales, ...firefliesItems].sort((a, b) =>
    String(b.date ?? '').localeCompare(String(a.date ?? ''))
  )

  const mensajes: SourceItem[] = messages.map((m) => ({
    id: String(m.id),
    title: `${m.canal} · ${m.direccion === 'out' || m.direccion === 'saliente' ? 'enviado' : 'recibido'}`,
    date: iso(m.timestamp),
    body: m.contenido,
    meta: [],
    link: null,
  }))

  const notas: SourceItem[] = activities
    .filter((a) => a.kind === 'note' || a.kind === 'call')
    .map((a) => ({
      id: String(a.id),
      title: a.title,
      date: iso(a.created_at),
      body: a.body,
      meta: metaPairs([
        ['Tipo', a.kind === 'call' ? 'Llamada' : 'Nota'],
        ['Por', a.created_by],
      ]),
      link: null,
    }))

  const escrito: SourceItem[] = lead.notas?.trim()
    ? [{ id: 'notas', title: 'Contexto escrito por el equipo', date: iso(lead.updated_at), body: lead.notas, meta: [], link: null }]
    : []

  const docs: SourceItem[] = documentos.map((d) => ({
    id: String(d.id),
    title: d.file_name,
    date: d.created_at,
    body: null,
    meta: metaPairs([['Tipo', d.tipo]]),
    link: d.web_link,
  }))

  const invoices: SourceItem[] = facturas.map((f) => ({
    id: String(f.id),
    title: `Factura ${f.invoice_number}`,
    date: f.issue_date,
    body: null,
    meta: metaPairs([
      ['Total', `${f.total.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`],
      ['Estado', f.status],
    ]),
    link: f.pdf_drive_url,
  }))

  const STATUS_TAREA: Record<string, string> = { pending: 'pendiente', in_progress: 'en curso', done: 'hecha' }
  const proyecto: SourceItem[] = proyectos.map((p) => {
    const ts = tareas.filter((t) => t.project_id === p.id)
    const tk = tickets.filter((t) => t.project_id === p.id)
    const hechas = ts.filter((t) => t.status === 'done').length
    const body = [
      p.ob_summary && `Resumen: ${p.ob_summary}`,
      p.ob_context && `Contexto del cliente: ${p.ob_context}`,
      p.ob_scope && `Alcance: ${p.ob_scope}`,
      p.ob_deliverables && `Entregables: ${p.ob_deliverables}`,
      p.ob_notes && `Notas internas: ${p.ob_notes}`,
      ts.length
        ? `Tareas (${hechas}/${ts.length} hechas):\n${ts
            .slice(0, 40)
            .map((t) => `- [${STATUS_TAREA[t.status] || t.status}] ${t.title}${t.assignee ? ` · ${t.assignee}` : ''}`)
            .join('\n')}`
        : null,
      tk.length
        ? `Tickets del cliente (${tk.length}):\n${tk
            .slice(0, 20)
            .map((t) => `- [${t.status} · ${t.priority}] ${t.title}`)
            .join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n')
    return {
      id: p.id,
      title: p.name,
      date: iso(p.updated_at),
      body: body || null,
      meta: metaPairs([
        ['Estado', p.status],
        ['Servicio', p.service_type],
        ['Inicio', p.fecha_inicio_real ? fecha(iso(p.fecha_inicio_real)) : null],
        ['Fin', p.fecha_fin_real ? fecha(iso(p.fecha_fin_real)) : null],
        ['Tareas', ts.length ? `${hechas}/${ts.length} hechas` : null],
        ['Tickets', tk.length || null],
      ]),
      link: `/gestion-proyecto/proyectos/${p.id}`,
    }
  })

  const sources: ContextSource[] = [
    { id: 'origen', label: 'Canal de entrada', items: origen },
    { id: 'correos', label: 'Correos', items: correos },
    { id: 'reuniones', label: 'Reuniones', items: reuniones },
    { id: 'mensajes', label: 'Mensajes', items: mensajes },
    { id: 'escrito', label: 'Contexto escrito', items: escrito },
    { id: 'notas', label: 'Notas y llamadas', items: notas },
    { id: 'documentos', label: 'Documentos', items: docs },
    ...(opts.includePrices ? [{ id: 'facturas' as const, label: 'Facturas', items: invoices }] : []),
    { id: 'proyecto', label: 'Proyecto', items: proyecto },
  ]

  return {
    lead: {
      id: lead.id,
      nombre: c.nombre || c.empresa || c.email || `Lead ${lead.id}`,
      empresa: c.empresa,
      email: c.email,
      emails_extra: extraEmails,
      telefono: c.telefono,
      estado: lead.estado ?? 'frio',
      es_cliente: proyectos.length > 0 || facturas.length > 0 || ['cerrado', 'activo'].includes(lead.estado ?? ''),
      prioridad: lead.prioridad,
      origen: lead.origen_principal,
      valor: opts.includePrices && lead.valor != null ? Number(lead.valor) : null,
      created_at: lead.created_at.toISOString(),
      updated_at: lead.updated_at.toISOString(),
    },
    sources,
  }
}

function fecha(d: string | null): string {
  if (!d) return 'sin fecha'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Todo el contexto en Markdown, listo para pegar en ChatGPT o Claude. */
export function contextToMarkdown(ctx: LeadContext, opts?: { maxBodyChars?: number }): string {
  const max = opts?.maxBodyChars ?? 20_000
  const l = ctx.lead
  const out: string[] = [
    `# ${l.nombre}${l.empresa && l.empresa !== l.nombre ? ` · ${l.empresa}` : ''}`,
    '',
    `Contexto exportado el ${fecha(new Date().toISOString())} desde el CRM de Buffalo AI.`,
    '',
    '## Datos',
    `- Email: ${l.email || '—'}`,
    ...(l.emails_extra.length ? [`- Otros correos: ${l.emails_extra.join(', ')}`] : []),
    `- Teléfono: ${l.telefono || '—'}`,
    `- Estado: ${estadoLabel(l.estado)}${l.prioridad ? ` · prioridad ${l.prioridad}` : ''}`,
    ...(l.es_cliente ? ['- Ya es cliente: tiene proyecto o facturas con Buffalo.'] : []),
    `- Canal de entrada: ${l.origen || '—'}`,
    ...(l.valor != null ? [`- Valor: ${l.valor.toLocaleString('es-ES')} €`] : []),
    `- Alta: ${fecha(l.created_at)} · Última actualización: ${fecha(l.updated_at)}`,
  ]
  for (const s of ctx.sources) {
    out.push('', `## ${s.label} (${s.items.length})`)
    if (!s.items.length) {
      out.push('_Sin datos._')
      continue
    }
    for (const it of s.items) {
      out.push('', `### ${it.title} — ${fecha(it.date)}`)
      for (const m of it.meta) out.push(`- ${m.label}: ${m.value}`)
      if (it.link) out.push(`- Enlace: ${it.link}`)
      if (it.body?.trim()) {
        const body = it.body.trim()
        out.push('', body.length > max ? `${body.slice(0, max)}…` : body)
      }
    }
  }
  return out.join('\n') + '\n'
}

export function fileNameFor(ctx: LeadContext): string {
  const slug = ctx.lead.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
  return `contexto-${slug || ctx.lead.id}.md`
}
