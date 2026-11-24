import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireLeadAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { getPersona, savePersonaContext } from '@/lib/onboarding/persona-context'

const putSchema = z.object({
  contexto: z.string().max(50_000, 'Contexto demasiado largo'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireLeadAccessAPI(req, res, req.query.leadId)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    if (req.method === 'GET') {
      const persona = await getPersona(leadId)
      if (!persona) return res.status(404).json({ error: 'Persona no encontrada' })
      return res.json({ persona })
    }

    if (req.method === 'PUT') {
      const body = putSchema.parse(req.body ?? {})
      await savePersonaContext(leadId, body.contexto)
      const persona = await getPersona(leadId)
      return res.json({ persona })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[onboarding/personas/leadId]', error)
    return res.status(500).json({ error: 'Error en la persona' })
  }
}
