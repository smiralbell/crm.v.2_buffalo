import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { askAboutLead, buildLeadContextMarkdown, draftLeadSummary } from '@/lib/leads/lead-ai'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

const postSchema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('preguntar'), pregunta: z.string().trim().min(1, 'Escribe una pregunta').max(2000) }),
  z.object({ accion: z.literal('resumen') }),
])

/**
 * GET  → contexto completo del lead en Markdown (para exportar o copiar).
 * POST {accion:'preguntar', pregunta} → respuesta de la IA.
 * POST {accion:'resumen'} → borrador de contexto propuesto por la IA (no se guarda).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    const includePrices = canSeeClientPrices(ctx.user.role)

    if (req.method === 'GET') {
      const out = await buildLeadContextMarkdown(ctx.leadId, { includePrices })
      if (!out) return res.status(404).json({ error: 'Lead no encontrado' })
      return res.json(out)
    }
    if (req.method === 'POST') {
      const body = postSchema.parse(req.body ?? {})
      if (body.accion === 'preguntar') {
        return res.json({ respuesta: await askAboutLead(ctx.leadId, body.pregunta, includePrices) })
      }
      return res.json({ borrador: await draftLeadSummary(ctx.leadId, includePrices) })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    if (isSessionError(error)) return
    console.error('[leads/contexto]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error con el contexto' })
  }
}
