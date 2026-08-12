import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import { generateDefinitionFromContext } from '@/lib/onboarding/project-context-ai'
import { getResearch, listNotes } from '@/lib/onboarding/notes/store'
import { TOPICS } from '@/lib/onboarding/notes/topics'
import { analyseNotesHeuristic } from '@/lib/onboarding/notes/topics'

const bodySchema = z.object({
  /** Si true, solo plantilla local sin LLM */
  template_only: z.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    const body = bodySchema.parse(req.body ?? {})
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { contact: { select: { nombre: true, empresa: true } } },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const notes = await listNotes(leadId)
    const research = await getResearch(leadId)
    const fuentes = notes.filter((n) => n.type !== 'definicion' && n.body.trim())
    if (!fuentes.length) {
      return res.status(400).json({ error: 'No hay notas de las que partir' })
    }

    const notesText = fuentes.map((n) => n.body).join('\n\n')
    const { cubiertos } = analyseNotesHeuristic({
      notesText,
      researchGanchos: research?.data?.ganchos || [],
    })
    const covered = new Set(cubiertos)
    const faltan = TOPICS.filter((t) => !covered.has(t.id)).map((t) => t.label)

    const contextParts = [
      research?.data
        ? `# INVESTIGACIÓN\n${research.data.nombre} · ${research.data.sector}\n${research.data.hace}`
        : null,
      `# NOTAS\n` +
        fuentes
          .map((n) => `## ${n.title || 'Sin título'} (${n.note_date})\n${n.body.trim()}`)
          .join('\n\n'),
      faltan.length
        ? `# AÚN NO PREGUNTADO\n${faltan.map((f) => `- ${f}`).join('\n')}`
        : null,
    ].filter(Boolean)

    const cfg = parseConfiguradorConfig(lead.configuracion)

    if (body.template_only || !process.env.OPENROUTER_API_KEY) {
      const draft = [
        '## Qué es el proyecto',
        '',
        `[Borrador a partir de ${fuentes.length} nota(s) del cuaderno.]`,
        '',
        '## Situación actual',
        '',
        fuentes
          .map((f) =>
            f.body
              .split('\n')
              .filter(Boolean)
              .slice(0, 3)
              .join(' ')
          )
          .join('\n\n'),
        '',
        '## Alcance propuesto',
        '',
        '- A completar',
        '',
        '## Fuera de alcance',
        '',
        '- A completar',
        '',
        faltan.length
          ? `## Pendiente de confirmar con el cliente\n\n${faltan.map((f) => '- ' + f).join('\n')}`
          : '',
      ]
        .filter((x) => x !== '')
        .join('\n')
      return res.status(200).json({ ok: true, definition: draft, source: 'template' })
    }

    const definition = await generateDefinitionFromContext({
      context: contextParts.join('\n\n─────\n\n'),
      projectName: cfg?.title || null,
      clientName: lead.contact?.nombre || null,
      clientCompany: lead.contact?.empresa || null,
      previousDefinition: notes.find((n) => n.type === 'definicion')?.body || null,
    })

    const withPending =
      faltan.length && !/pendiente de confirmar/i.test(definition)
        ? `${definition.trim()}\n\n## Pendiente de confirmar con el cliente\n\n${faltan
            .map((f) => `- ${f}`)
            .join('\n')}`
        : definition

    return res.status(200).json({
      ok: true,
      definition: withPending,
      source: 'llm',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[notes-draft-definition]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error redactando definición',
    })
  }
}
