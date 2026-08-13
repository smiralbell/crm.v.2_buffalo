import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { syncNotebookContextToLead } from '@/lib/onboarding/notes/sync-context'

const bodySchema = z.object({
  apply_definition: z.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    const body = bodySchema.parse(req.body ?? {})
    const result = await syncNotebookContextToLead({
      leadId,
      createdBy: user.email || user.name || String(user.id),
      applyDefinition: body.apply_definition === true,
    })

    return res.status(200).json({ ok: true, ...result })
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
    console.error('[notes-sync]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error sincronizando contexto',
    })
  }
}
