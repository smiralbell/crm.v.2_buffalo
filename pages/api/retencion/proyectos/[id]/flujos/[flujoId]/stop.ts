import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { flujoKey } from '@/lib/retencion/flujos/runner'
import { getFlujo } from '@/lib/retencion/flujos/store'
import { requestStop } from '@/lib/retencion/run-control'

/**
 * Para la ejecución en marcha de un flujo. Si ya no corre en este proceso (por ejemplo,
 * tras un reinicio), la ejecución que se quedó «en marcha» se cierra como parada.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    const flujoId = String(req.query.flujoId || '')
    if (!proyectoId || !flujoId) return res.status(400).json({ error: 'ids requeridos' })
    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (!(await getFlujo(proyectoId, flujoId))) return res.status(404).json({ error: 'Flujo no encontrado' })

    const live = requestStop(flujoKey(flujoId))
    if (!live) {
      await query(
        `UPDATE retencion_flujo_runs SET status = 'error', error = 'Parado a mano', finished_at = NOW()
          WHERE flujo_id = $1::uuid AND status = 'running'`,
        [flujoId]
      )
    }
    return res.status(200).json({ ok: true, live })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[retencion/flujos/stop]', error)
    return res.status(500).json({ error: 'No se pudo parar el flujo' })
  }
}
