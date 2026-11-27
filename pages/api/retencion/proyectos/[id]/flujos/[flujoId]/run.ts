import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { launchFlujoById } from '@/lib/retencion/flujos/runner'

/**
 * Lanza el flujo ahora mismo, en segundo plano, y devuelve el id de la ejecución.
 * El resultado se consulta en …/runs (la pantalla lo sigue hasta que termina): así una
 * ejecución larga no choca con el tiempo máximo de respuesta del proxy.
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

    const run = await launchFlujoById(proyectoId, flujoId)
    if (!run) return res.status(404).json({ error: 'Flujo no encontrado' })
    return res.status(202).json({ run_id: run.runId })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[retencion/flujos/run]', error)
    return res.status(500).json({ error: 'No se pudo ejecutar el flujo' })
  }
}
