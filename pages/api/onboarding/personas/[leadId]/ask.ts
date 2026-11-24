import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireLeadAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { askAboutPersona } from '@/lib/onboarding/persona-context'

const bodySchema = z.object({
  question: z.string().min(1, 'Escribe una pregunta').max(2000),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireLeadAccessAPI(req, res, req.query.leadId)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const body = bodySchema.parse(req.body ?? {})
    const answer = await askAboutPersona(leadId, body.question)
    return res.json({ answer })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[onboarding/personas/ask]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error de IA' })
  }
}
