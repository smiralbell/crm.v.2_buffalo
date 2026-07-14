import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import {
  listWebFormSubmissions,
  updateWebFormSubmissionStatus,
  type WebFormSubmissionEstado,
} from '@/lib/marketing/web-form-submissions'

const patchSchema = z.object({
  id: z.number().int().positive(),
  estado: z.enum(['pendiente', 'contactado', 'descartado']),
  notas: z.string().max(2000).optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const now = new Date()
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const period = (req.query.period as string) || currentPeriod

  if (req.method === 'GET') {
    try {
      const submissions = await listWebFormSubmissions(period)
      return res.status(200).json({ submissions, period })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      if (msg.includes('web_form_submissions') && msg.includes('does not exist')) {
        return res.status(200).json({ submissions: [], period, table_missing: true })
      }
      console.error('[api/marketing/web-form-submissions GET]', err)
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'PATCH') {
    try {
      const parsed = patchSchema.parse(req.body)
      const updated = await updateWebFormSubmissionStatus(
        parsed.id,
        parsed.estado as WebFormSubmissionEstado,
        parsed.notas
      )
      if (!updated) return res.status(404).json({ error: 'Envío no encontrado' })
      return res.status(200).json({ submission: updated })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
      }
      console.error('[api/marketing/web-form-submissions PATCH]', err)
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
