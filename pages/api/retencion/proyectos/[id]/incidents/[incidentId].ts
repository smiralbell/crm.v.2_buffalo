import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { markIncidentSolved } from '@/lib/retencion/incidents'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    const incidentId = String(req.query.incidentId || '')
    if (!proyectoId || !incidentId) return res.status(400).json({ error: 'id requerido' })

    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    const body = req.body && typeof req.body === 'object' ? (req.body as { status?: string }) : {}
    if (body.status !== 'solved') {
      return res.status(400).json({ error: 'Solo se admite status: solved' })
    }

    const row = await markIncidentSolved(proyectoId, incidentId)
    if (!row) return res.status(404).json({ error: 'Incidencia no encontrada o ya solucionada' })
    return res.status(200).json({ incident: row })
  } catch (err) {
    if (res.headersSent) return
    console.error('[retencion/incidents/id]', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
  }
}
