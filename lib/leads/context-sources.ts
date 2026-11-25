import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { listActivities } from '@/lib/crm/activities'
import { listMeetingsForContact, listMeetingsForLead } from '@/lib/integrations/fireflies/store'
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
    telefono: string | null
    estado: string
    prioridad: string | null
    origen: string | null
    valor: number | null
    created_at: string
    updated_at: string
  }
  sources: ContextSource[]
}

/** Fuentes que cuentan como «contenido de valor» para el resumen (la entrada del lead no). */
export const VALUE_SOURCES: SourceId[] = ['correos', 'reuniones', 'mensajes', 'escrito', 'notas', 'documentos']

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null)

function metaPairs(pairs: [string, unknown][]): { label: string; value: string }[] {
  return pairs
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([label, v]) => ({ label, value: String(v) }))
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

  const [activities, meetingsLead, meetingsContact, meta, messages, documentos, facturas, proyectos] = await Promise.all([
    safe(() => listActivities({ contactId: lead.contact_id, limit: 200 }), []),
    safe(() => listMeetingsForLead(leadId), []),
    safe(() => listMeetingsForContact(lead.contact_id), []),
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
        query<{ id: string; name: string; status: string; service_type: string | null; updated_at: Date }>(
          `SELECT id::text, name, status, service_type, updated_at FROM proyectos WHERE lead_id = $1 ORDER BY updated_at DESC`,
          [leadId]
        ).then((r) => r.rows),
      [] as { id: string; name: string; status: string; service_type: string | null; updated_at: Date }[]
    ),
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
  const reuniones: SourceItem[] = [...meetingsLead, ...meetingsContact]
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

  const proyecto: SourceItem[] = proyectos.map((p) => ({
    id: p.id,
    title: p.name,
    date: iso(p.updated_at),
    body: null,
    meta: metaPairs([
      ['Estado', p.status],
      ['Servicio', p.service_type],
    ]),
    link: `/gestion-proyecto/proyectos/${p.id}`,
  }))

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
      telefono: c.telefono,
      estado: lead.estado ?? 'frio',
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
    `- Teléfono: ${l.telefono || '—'}`,
    `- Estado: ${estadoLabel(l.estado)}${l.prioridad ? ` · prioridad ${l.prioridad}` : ''}`,
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
