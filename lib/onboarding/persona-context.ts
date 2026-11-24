import { prisma } from '@/lib/prisma'
import { listActivities } from '@/lib/crm/activities'
import { openRouterChatCompletion } from '@/lib/openrouter'

/** Límite de caracteres del contexto que se envía a la IA. */
const MAX_CONTEXT_CHARS = 12_000
const ACTIVITY_LIMIT = 30
const ACTIVITY_BODY_CHARS = 600

export type PersonaRow = {
  id: number
  nombre: string | null
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: string | null
  contexto: string | null
  updated_at: Date
}

export type PersonaDetail = PersonaRow & {
  ciudad: string | null
  direccion_fiscal: string | null
  cif: string | null
}

export async function listPersonas(opts: { q?: string; limit?: number }): Promise<PersonaRow[]> {
  const q = (opts.q || '').trim()
  const leads = await prisma.lead.findMany({
    where: q
      ? {
          contact: {
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { empresa: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { telefono: { contains: q } },
            ],
          },
        }
      : undefined,
    orderBy: { updated_at: 'desc' },
    take: Math.min(Math.max(opts.limit ?? 200, 1), 500),
    select: {
      id: true,
      estado: true,
      contexto: true,
      updated_at: true,
      contact: { select: { nombre: true, empresa: true, email: true, telefono: true } },
    },
  })
  return leads.map((l) => ({
    id: l.id,
    nombre: l.contact.nombre,
    empresa: l.contact.empresa,
    email: l.contact.email,
    telefono: l.contact.telefono,
    estado: l.estado,
    contexto: l.contexto,
    updated_at: l.updated_at,
  }))
}

export async function getPersona(leadId: number): Promise<PersonaDetail | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      estado: true,
      contexto: true,
      updated_at: true,
      contact: {
        select: { nombre: true, empresa: true, email: true, telefono: true, ciudad: true, direccion_fiscal: true, cif: true },
      },
    },
  })
  if (!lead) return null
  return {
    id: lead.id,
    nombre: lead.contact.nombre,
    empresa: lead.contact.empresa,
    email: lead.contact.email,
    telefono: lead.contact.telefono,
    ciudad: lead.contact.ciudad,
    direccion_fiscal: lead.contact.direccion_fiscal,
    cif: lead.contact.cif,
    estado: lead.estado,
    contexto: lead.contexto,
    updated_at: lead.updated_at,
  }
}

export async function savePersonaContext(leadId: number, contexto: string): Promise<void> {
  const value = contexto.trim() ? contexto : null
  await prisma.lead.update({
    where: { id: leadId },
    data: { contexto: value, updated_at: new Date() },
  })
}

/** Historial reciente del contacto (correos, llamadas, notas) como texto para la IA. */
async function recentHistoryText(leadId: number): Promise<string> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { contact_id: true },
  })
  if (!lead) return ''
  const items = await listActivities({ contactId: lead.contact_id, limit: ACTIVITY_LIMIT })
  return items
    .map((a) => {
      const when = new Date(a.created_at).toISOString().slice(0, 10)
      const body = (a.body || '').trim().slice(0, ACTIVITY_BODY_CHARS)
      return `- [${when}] (${a.kind}) ${a.title}${body ? `: ${body}` : ''}`
    })
    .join('\n')
}

function clip(text: string): string {
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}…` : text
}

const BASE_SYSTEM =
  'Eres el asistente interno de Buffalo AI. Trabajas solo con la información que se te da en el contexto ' +
  'de la persona y su historial. Responde en español de España, de forma clara y breve. Si la información ' +
  'no aparece en el contexto, dilo sin inventar nada.'

/** Pregunta a la IA sobre una persona, usando su contexto guardado y su historial reciente. */
export async function askAboutPersona(leadId: number, question: string): Promise<string> {
  const persona = await getPersona(leadId)
  if (!persona) throw new Error('Persona no encontrada')
  const history = await recentHistoryText(leadId)
  const context = clip(
    [
      `Persona: ${persona.nombre || 'sin nombre'}${persona.empresa ? ` (${persona.empresa})` : ''}`,
      `Estado: ${persona.estado || 'sin estado'}`,
      '',
      '## Contexto guardado',
      persona.contexto?.trim() || '(vacío)',
      '',
      '## Historial reciente',
      history || '(sin historial)',
    ].join('\n')
  )
  return openRouterChatCompletion([
    { role: 'system', content: BASE_SYSTEM },
    { role: 'user', content: `${context}\n\n## Pregunta\n${question.trim()}` },
  ])
}

/** Propone un resumen de la persona para revisarlo y guardarlo a mano. No guarda nada. */
export async function draftPersonaSummary(leadId: number): Promise<string> {
  const persona = await getPersona(leadId)
  if (!persona) throw new Error('Persona no encontrada')
  const history = await recentHistoryText(leadId)
  const context = clip(
    [
      `Persona: ${persona.nombre || 'sin nombre'}${persona.empresa ? ` (${persona.empresa})` : ''}`,
      `Estado: ${persona.estado || 'sin estado'}`,
      '',
      '## Contexto actual (puede estar vacío)',
      persona.contexto?.trim() || '(vacío)',
      '',
      '## Historial reciente',
      history || '(sin historial)',
    ].join('\n')
  )
  return openRouterChatCompletion([
    {
      role: 'system',
      content:
        BASE_SYSTEM +
        ' Escribe un resumen en texto plano (sin markdown) con: quién es, qué quiere, en qué punto está, ' +
        'qué se ha hablado y qué queda pendiente. Máximo 12 líneas.',
    },
    { role: 'user', content: context },
  ])
}
