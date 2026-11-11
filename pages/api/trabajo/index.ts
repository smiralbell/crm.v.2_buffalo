import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { resolveWorkScope, workProjectsFor } from '@/lib/trabajo/access'
import { isValidDay, presetRange, todayMadrid, validateWorkItems } from '@/lib/trabajo/format'
import { createWorkLog, listWorkEntries, listWorkReports } from '@/lib/trabajo/store'
import type { TrabajoResponse } from '@/lib/trabajo/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }

  try {
    const scope = await resolveWorkScope(user, req.method === 'GET' ? req.query.user_id : (req.body || {}).user_id)
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error })
    const today = todayMadrid()

    if (req.method === 'GET') {
      const fallback = presetRange('30d', today)
      const from = isValidDay(req.query.desde) ? String(req.query.desde) : fallback.from
      const to = isValidDay(req.query.hasta) ? String(req.query.hasta) : fallback.to
      if (from > to) return res.status(400).json({ error: 'La fecha inicial va después de la final' })
      const entries = await listWorkEntries({ userIds: scope.user ? [scope.user.id] : null, from, to })
      const reports = await listWorkReports(
        Array.from(new Set(entries.map((e) => e.report_id).filter((x): x is string => Boolean(x))))
      )
      const body: TrabajoResponse = {
        entries,
        reports,
        projects: scope.user ? await workProjectsFor(scope.user.id) : [],
        me: { id: user.id, name: user.name, role: user.role },
        scope_user: scope.user,
        range: { from, to },
      }
      return res.status(200).json(body)
    }

    if (req.method === 'POST') {
      if (!scope.user) return res.status(400).json({ error: 'Elige de quién es el trabajo' })
      const body = req.body || {}
      const checked = validateWorkItems(body.items, { today, projects: await workProjectsFor(scope.user.id) })
      if (!checked.ok) return res.status(400).json({ error: checked.error })
      const saved = await createWorkLog({
        userId: scope.user.id,
        items: checked.items,
        rawText: typeof body.texto_original === 'string' ? body.texto_original : null,
        source: 'manual',
        createdByName: user.name,
      })
      return res.status(201).json({ ...saved, warnings: checked.warnings })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[api/trabajo]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
