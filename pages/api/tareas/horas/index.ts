import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getHoursReport } from '@/lib/horas/store'

const MAX_RANGE_DAYS = 93

/**
 * GET ?from=ISO&to=ISO: horas trabajadas por persona en el periodo.
 * Los admins ven a todo el equipo; el resto, solo las suyas.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const from = new Date(String(req.query.from || ''))
  const to = new Date(String(req.query.to || ''))
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return res.status(400).json({ error: 'Periodo no válido' })
  }
  if ((to.getTime() - from.getTime()) / 86400000 > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: 'Como mucho tres meses de golpe' })
  }

  try {
    const report = await getHoursReport(from, to, user.role === 'admin' ? {} : { onlyUserId: user.id })
    return res.status(200).json({ ...report, can_see_team: user.role === 'admin' })
  } catch (e) {
    console.error('[tareas/horas]', e)
    return res.status(500).json({ error: 'No se pudieron calcular las horas' })
  }
}
