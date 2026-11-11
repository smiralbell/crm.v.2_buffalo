import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { resolveWorkScope, workProjectsFor } from '@/lib/trabajo/access'
import { todayMadrid } from '@/lib/trabajo/format'
import { splitWorkReport } from '@/lib/trabajo/split'

/** Propone los trabajos separados a partir de un resumen libre. No guarda nada. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  try {
    const body = req.body || {}
    const scope = await resolveWorkScope(user, body.user_id)
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error })
    if (!scope.user) return res.status(400).json({ error: 'Elige de quién es el trabajo' })
    const text = typeof body.texto === 'string' ? body.texto : ''
    if (text.length > 20_000) return res.status(400).json({ error: 'El texto es demasiado largo (máx. 20.000 caracteres)' })
    const result = await splitWorkReport(text, { today: todayMadrid(), projects: await workProjectsFor(scope.user.id) })
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.status(200).json(result)
  } catch (error) {
    console.error('[api/trabajo/separar]', error)
    return res.status(500).json({ error: 'No se ha podido separar el texto. Prueba otra vez o apúntalo a mano.' })
  }
}
