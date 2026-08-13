/**
 * Sincroniza el cuaderno (notas + research) al project_context del lead
 * para que propuesta/contrato/pre-kickoff lean el mismo historial.
 *
 * Hay dos modos:
 * - lightweight: solo reescribe el bloque del cuaderno (rápido, sin IA ni Fireflies)
 * - full: además refresca reuniones/auditoría residual (al generar docs)
 */

import { prisma } from '@/lib/prisma'
import {
  buildCrmContextSources,
  composeProjectContext,
  mergeLeadConfig,
  stripCrmSourcesBlock,
} from '@/lib/onboarding/project-context-ai'
import {
  getResearch,
  listNotes,
  notesToContextBlock,
  researchToContextBlock,
  type ProjectNote,
  type ProjectResearch,
} from '@/lib/onboarding/notes/store'
import { logCrmActivity } from '@/lib/crm/activities'

/** Quita bloques generados por el cuaderno; deja Fireflies / auditoría / texto libre. */
export function stripNotebookSections(text: string): string {
  if (!text) return ''
  let out = text
  out = out.replace(
    /(?:^|\n)#{1,3}\s*Notas del cuaderno[\s\S]*?(?=\n#{1,3}\s|\n---\s*\n|$)/gi,
    '\n'
  )
  out = out.replace(
    /(?:^|\n)#{1,3}\s*Investigación web[\s\S]*?(?=\n#{1,3}\s|\n---\s*\n|$)/gi,
    '\n'
  )
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return out
}

export function buildNotebookSlice(
  notes: ProjectNote[],
  research: ProjectResearch | null
): string {
  return [notesToContextBlock(notes), researchToContextBlock(research)]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

/** Definición del proyecto = nota «definición» si existe; si no, todas las notas. */
export function definitionFromNotes(notes: ProjectNote[]): string | null {
  const def = notes.find((n) => n.type === 'definicion' && n.body.trim())
  if (def) return def.body.trim()
  const bodies = notes
    .filter((n) => n.body.trim())
    .map((n) => n.body.trim())
  if (!bodies.length) return null
  return bodies.join('\n\n').slice(0, 12000)
}

/**
 * Actualización barata tras autoguardado: reescribe solo la ficha/notas
 * dentro de project_context. No llama a OpenRouter ni a Fireflies.
 */
export async function syncNotebookContextLightweight(input: {
  leadId: number
  /** Si true y hay nota definición, actualiza description */
  applyDefinition?: boolean
}): Promise<{ context: string; definition: string | null; notesCount: number }> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, configuracion: true },
  })
  if (!lead) throw new Error('Lead no encontrado')

  const notes = await listNotes(input.leadId)
  const research = await getResearch(input.leadId)
  const notebook = buildNotebookSlice(notes, research)

  const { parseConfiguradorConfig } = await import('@/lib/engranaje5/map-config')
  const cfg = parseConfiguradorConfig(lead.configuracion)
  const prev = (cfg?.project_context || '').trim()
  const kept = stripNotebookSections(stripCrmSourcesBlock(prev))
  // Conserva el bloque "Fuentes CRM" si existía (Fireflies etc.)
  const sourcesMatch = prev.match(
    /(?:^|\n)---\s*\n+# Fuentes CRM[\s\S]*$/i
  )
  const sourcesTail = sourcesMatch ? sourcesMatch[0].replace(/^\n/, '') : ''

  const context = [notebook, kept, sourcesTail].filter(Boolean).join('\n\n').trim()

  // Las notas del cuaderno alimentan siempre la definición del proyecto
  const definition = definitionFromNotes(notes)

  const { encoded } = mergeLeadConfig(lead.configuracion, {
    project_context: context || undefined,
    ...(definition ? { description: definition } : {}),
  })

  await prisma.lead.update({
    where: { id: input.leadId },
    data: {
      configuracion: encoded,
      ...(definition ? { notas: definition } : {}),
    },
  })

  return {
    context,
    definition,
    notesCount: notes.filter((n) => n.body.trim()).length,
  }
}

/** Sync completo (docs / botón Crear documentación). */
export async function syncNotebookContextToLead(input: {
  leadId: number
  createdBy?: string | null
  applyDefinition?: boolean
  logActivity?: boolean
}): Promise<{
  context: string
  definition: string | null
  notesCount: number
}> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: {
      id: true,
      contact_id: true,
      configuracion: true,
      notas: true,
      contact: { select: { id: true } },
    },
  })
  if (!lead) throw new Error('Lead no encontrado')

  const notes = await listNotes(input.leadId)
  const research = await getResearch(input.leadId)
  const manual = buildNotebookSlice(notes, research)
  const sources = await buildCrmContextSources(input.leadId).catch(() => '')
  const sourcesWithoutNotes = stripNotebookSections(sources)

  const context = composeProjectContext({
    manual: manual || stripCrmSourcesBlock(sources),
    sources: sourcesWithoutNotes,
  })

  const definition =
    input.applyDefinition === false ? null : definitionFromNotes(notes)

  const { encoded } = mergeLeadConfig(lead.configuracion, {
    project_context: context || undefined,
    ...(definition ? { description: definition } : {}),
  })

  await prisma.lead.update({
    where: { id: input.leadId },
    data: {
      configuracion: encoded,
      ...(definition ? { notas: definition } : {}),
    },
  })

  if (input.logActivity !== false) {
    await logCrmActivity({
      contactId: lead.contact?.id ?? lead.contact_id,
      leadId: input.leadId,
      kind: 'onboarding',
      title: 'Contexto sincronizado desde el cuaderno',
      body:
        notes.filter((n) => n.body.trim()).length > 0
          ? `${notes.filter((n) => n.body.trim()).length} nota(s) · listo para documentación`
          : 'Cuaderno vacío sincronizado',
      meta: {
        source: 'notebook',
        notes_count: notes.length,
        has_research: Boolean(research),
        definition_applied: Boolean(definition),
        mode: 'full',
      },
      createdBy: input.createdBy || null,
    })
  }

  return {
    context,
    definition,
    notesCount: notes.filter((n) => n.body.trim()).length,
  }
}
