import type { NextApiRequest, NextApiResponse } from 'next'
import { requireLeadAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { draftPersonaSummary } from '@/lib/onboarding/persona-context'

/** Propone un resumen con IA. No guarda nada: lo revisa la persona y lo guarda a mano. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireLeadAccessAPI(req, res, req.query.leadId)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const draft = await draftPersonaSummary(leadId)
    return res.json({ draft })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[onboarding/personas/draft]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error de IA' })
  }
}
