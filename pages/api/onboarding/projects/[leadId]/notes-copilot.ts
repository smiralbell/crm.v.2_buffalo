import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import { openRouterChatCompletion, parseJsonFromModelOutput, resolveModel } from '@/lib/openrouter'
import { buildProposalContextPack } from '@/lib/onboarding/proposal-context-pack'
import { buildCrmContextSources } from '@/lib/onboarding/project-context-ai'
import { getResearch, listNotes } from '@/lib/onboarding/notes/store'
import {
  analyseNotesHeuristic,
  formatTopicsForPrompt,
  type CopilotQuestion,
} from '@/lib/onboarding/notes/topics'

const bodySchema = z.object({
  force: z.boolean().optional(),
  content_hash: z.string().max(128).optional(),
})

const cache = new Map<string, { at: number; payload: Record<string, unknown> }>()
const CACHE_TTL_MS = 30 * 60_000

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
    const notesText = notes
      .filter((n) => n.type !== 'definicion')
      .map((n) => n.body)
      .join('\n\n')
    const hash =
      body.content_hash ||
      `${leadId}:${notesText.length}:${notes.map((n) => n.updated_at).join('|')}:${research?.updated_at || ''}`

    if (!body.force) {
      const hit = cache.get(hash)
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return res.status(200).json({ ok: true, cached: true, ...hit.payload })
      }
    }

    const cfg = parseConfiguradorConfig(lead.configuracion)
    const crmSources = await buildCrmContextSources(leadId).catch(() => '')
    const pack = buildProposalContextPack({
      definition: cfg?.description || null,
      context: [notesText, research?.data ? JSON.stringify(research.data) : '', crmSources]
        .filter(Boolean)
        .join('\n\n'),
      projectName: cfg?.title || null,
      clientName: lead.contact?.nombre || null,
      clientCompany: lead.contact?.empresa || null,
      maxChars: 20000,
    })

    const fallback = analyseNotesHeuristic({
      notesText,
      researchGanchos: research?.data?.ganchos || [],
    })

    let cubiertos = fallback.cubiertos
    let preguntas: CopilotQuestion[] = fallback.preguntas
    let source: 'llm' | 'heuristic' = 'heuristic'

    try {
      if (process.env.OPENROUTER_API_KEY) {
        const raw = await openRouterChatCompletion(
          [
            {
              role: 'system',
              content: `Eres el copiloto de descubrimiento de Buffalo AI en reuniones comerciales de alto nivel.
Tu trabajo: proponer las mejores preguntas posibles — concretas, afiladas, que desbloqueen precio, alcance o decisión.
Guion de temas (prioridad a huecos):
${formatTopicsForPrompt()}

Reglas de calidad:
- Máximo 8 preguntas. Solo las TOP. Nada genérico ni de manual.
- Cada pregunta debe anclarse a algo dicho en las notas (cifra, herramienta, persona, canal) cuando exista.
- Prefiere una pregunta brutalmente clara a tres mediocres.
- Tono de reunión real: directo, profesional, en español.
- No inventes hechos del cliente.

Devuelve SOLO JSON:
{ "cubiertos": ["volumen","canales",...],
  "preguntas": [{ "tema":"...", "tipo":"hueco|profundizar|web|contexto", "texto":"...", "porque":"..." }] }`,
            },
            {
              role: 'user',
              content: `CONTEXTO:\n${pack.block}\n\nNOTAS:\n${notesText.slice(0, 14000) || '(vacío)'}`,
            },
          ],
          {
            model: resolveModel('heavy'),
            temperature: 0.3,
            maxTokens: 2500,
            json: true,
          }
        )
        const parsed = parseJsonFromModelOutput(raw) as {
          cubiertos?: string[]
          preguntas?: CopilotQuestion[]
        }
        if (Array.isArray(parsed.cubiertos) && parsed.cubiertos.length) {
          cubiertos = parsed.cubiertos.map(String)
        }
        if (Array.isArray(parsed.preguntas) && parsed.preguntas.length) {
          preguntas = parsed.preguntas.slice(0, 8).map((p) => ({
            tema: String(p.tema || 'Tema'),
            tipo:
              p.tipo === 'profundizar' || p.tipo === 'web' || p.tipo === 'contexto'
                ? p.tipo
                : 'hueco',
            texto: String(p.texto || ''),
            porque: String(p.porque || ''),
          }))
          source = 'llm'
        }
      }
    } catch (e) {
      console.warn('[notes-copilot] fallback heurístico', e)
    }

    const payload = { cubiertos, preguntas: preguntas.slice(0, 8), source, topics_total: 14 }
    cache.set(hash, { at: Date.now(), payload })
    return res.status(200).json({ ok: true, cached: false, ...payload })
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
    console.error('[notes-copilot]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error del copiloto',
    })
  }
}
