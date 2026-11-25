import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireMarketingAPI } from '@/lib/auth'
import { OutcomeError, getOutcome, outcomeInput, saveOutcome } from '@/lib/marketing/sales'

/** Resultado de un lead: perdido y motivo, encaja, no se presentó. GET ?lead_id · PUT */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireMarketingAPI(req, res)
  } catch {
    return
  }
  try {
    if (req.method === 'GET') {
      const id = Number(req.query.lead_id)
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'lead_id inválido' })
      return res.status(200).json({ outcome: await getOutcome(id) })
    }
    if (req.method === 'PUT') return res.status(200).json({ outcome: await saveOutcome(outcomeInput.parse(req.body), user.email) })
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message })
    if (err instanceof OutcomeError) return res.status(409).json({ error: err.message })
    console.error('[api/marketing/outcome]', err)
    return res.status(500).json({ error: 'Error interno' })
  }
}
