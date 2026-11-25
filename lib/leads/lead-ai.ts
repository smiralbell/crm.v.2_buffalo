import { prisma } from '@/lib/prisma'
import { listActivities } from '@/lib/crm/activities'
import { openRouterChatCompletion } from '@/lib/openrouter'
import { listLinkedInvoices } from '@/lib/leads/facturas'
import { listPersonaDocumentos, savedFolder } from '@/lib/leads/archivos'
import { estadoLabel } from '@/lib/leads/estados'

const HISTORY_LIMIT = 30
const HISTORY_BODY_CHARS = 600
const MAX_AI_CONTEXT_CHARS = 14_000

function fecha(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function eur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`
}

/**
 * Todo lo que sabemos de un lead en un solo texto (Markdown): datos, contexto,
 * facturas, documentos e historial reciente. Sirve para exportarlo o pasárselo a la IA.
 */
export async function buildLeadContextMarkdown(
  leadId: number,
  opts: { includePrices: boolean }
): Promise<{ markdown: string; fileName: string } | null> {
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
      contact: {
        select: { nombre: true, empresa: true, email: true, telefono: true, ciudad: true, cif: true, direccion_fiscal: true },
      },
    },
  })
  if (!lead) return null

  const [facturas, documentos, carpeta, historial] = await Promise.all([
    opts.includePrices ? listLinkedInvoices(leadId) : Promise.resolve([]),
    listPersonaDocumentos(leadId).catch(() => []),
    savedFolder(leadId).catch(() => null),
    listActivities({ contactId: lead.contact_id, limit: HISTORY_LIMIT }).catch(() => []),
  ])

  const c = lead.contact
  const nombre = c.nombre || c.empresa || c.email || `Lead ${lead.id}`
  const lines: string[] = [
    `# ${nombre}`,
    '',
    `Exportado el ${fecha(new Date())} desde el CRM de Buffalo AI.`,
    '',
    '## Contacto',
    `- Nombre: ${c.nombre || '—'}`,
    `- Empresa: ${c.empresa || '—'}`,
    `- Email: ${c.email || '—'}`,
    `- Teléfono: ${c.telefono || '—'}`,
    `- Ciudad: ${c.ciudad || '—'}`,
    ...(c.cif ? [`- CIF/NIF: ${c.cif}`] : []),
    ...(c.direccion_fiscal ? [`- Dirección fiscal: ${c.direccion_fiscal}`] : []),
    '',
    '## Lead',
    `- Estado: ${estadoLabel(lead.estado)}`,
    `- Prioridad: ${lead.prioridad || '—'}`,
    `- Origen: ${lead.origen_principal || '—'}`,
    ...(opts.includePrices ? [`- Valor: ${eur(lead.valor != null ? Number(lead.valor) : null)}`] : []),
    `- Creado: ${fecha(lead.created_at)} · Actualizado: ${fecha(lead.updated_at)}`,
    '',
    '## Contexto',
    lead.notas?.trim() || '(sin contexto escrito)',
  ]

  if (opts.includePrices) {
    lines.push('', '## Facturas')
    if (facturas.length === 0) lines.push('(sin facturas vinculadas)')
    for (const f of facturas) {
      lines.push(`- ${f.invoice_number} · ${fecha(f.issue_date)} · ${eur(f.total)} · ${f.status}`)
    }
  }

  lines.push('', '## Documentos')
  if (carpeta) lines.push(`Carpeta de Drive: ${carpeta.folder_url}`)
  if (documentos.length === 0) lines.push('(sin documentos subidos)')
  for (const d of documentos) {
    lines.push(`- ${d.file_name} (${d.tipo}, ${fecha(d.created_at)})${d.web_link ? ` · ${d.web_link}` : ''}`)
  }

  lines.push('', '## Historial reciente')
  if (historial.length === 0) lines.push('(sin actividad registrada)')
  for (const a of historial) {
    const body = (a.body || '').trim().replace(/\s+/g, ' ').slice(0, HISTORY_BODY_CHARS)
    lines.push(`- ${fecha(a.created_at)} · ${a.kind} · ${a.title}${body ? ` — ${body}` : ''}`)
  }

  const slug = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
  return { markdown: lines.join('\n') + '\n', fileName: `contexto-${slug || lead.id}.md` }
}

const SYSTEM =
  'Eres el asistente interno de Buffalo AI. Trabajas solo con la información del lead que se te da. ' +
  'Responde en español de España, claro y breve. Si un dato no aparece, dilo sin inventar nada.'

function clip(text: string): string {
  return text.length > MAX_AI_CONTEXT_CHARS ? `${text.slice(0, MAX_AI_CONTEXT_CHARS)}…` : text
}

/** Responde una pregunta sobre el lead con todo su contexto. */
export async function askAboutLead(leadId: number, question: string, includePrices: boolean): Promise<string> {
  const ctx = await buildLeadContextMarkdown(leadId, { includePrices })
  if (!ctx) throw new Error('Lead no encontrado')
  return openRouterChatCompletion([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${clip(ctx.markdown)}\n\n## Pregunta\n${question.trim()}` },
  ])
}

/** Propone un resumen del lead para revisarlo y guardarlo como contexto. No guarda nada. */
export async function draftLeadSummary(leadId: number, includePrices: boolean): Promise<string> {
  const ctx = await buildLeadContextMarkdown(leadId, { includePrices })
  if (!ctx) throw new Error('Lead no encontrado')
  return openRouterChatCompletion([
    {
      role: 'system',
      content:
        SYSTEM +
        ' Escribe un resumen en texto plano (sin markdown): quién es, qué quiere, en qué punto está, ' +
        'qué se ha hablado y qué queda pendiente. Máximo 12 líneas.',
    },
    { role: 'user', content: clip(ctx.markdown) },
  ])
}
