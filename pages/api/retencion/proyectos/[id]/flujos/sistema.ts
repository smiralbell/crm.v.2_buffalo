import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { setWatchHidden } from '@/lib/retencion/flujos/store'
import { saveWatchSettings } from '@/lib/retencion/watch-store'

const patchSchema = z.object({ watch_hidden: z.boolean() })

/**
 * PATCH {watch_hidden}: quita o recupera el «Informe del sistema» (flujo predefinido) en la pestaña Sistema.
 * Al quitarlo también se para su ejecución automática.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })
    await assertProjectAccess(user, proyectoId, res)
    if (user.role === 'developer') return res.status(403).json({ error: 'Sin permiso' })
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })
    if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

    const body = patchSchema.parse(req.body ?? {})
    await setWatchHidden(proyectoId, body.watch_hidden)
    if (body.watch_hidden) await saveWatchSettings(proyectoId, { every_minutes: null })
    return res.status(200).json({ watch_hidden: body.watch_hidden })
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) return
    console.error('[retencion/flujos/sistema]', error)
    return res.status(500).json({ error: 'No se pudo guardar' })
  }
}
