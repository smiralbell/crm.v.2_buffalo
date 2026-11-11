import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { canEditWorkEntry, hasWorkLog, workProjectsFor } from '@/lib/trabajo/access'
import { todayMadrid, validateWorkItems } from '@/lib/trabajo/format'
import { deleteWorkEntry, getWorkEntry, updateWorkEntry } from '@/lib/trabajo/store'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (user.role !== 'admin' && !hasWorkLog(user.role)) {
    return res.status(403).json({ error: 'No tienes módulo de trabajo diario' })
  }
  const id = String(req.query.id ?? '')
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID no válido' })

  try {
    const entry = await getWorkEntry(id)
    // Si no es suya, se responde igual que si no existiera
    if (!entry || !canEditWorkEntry(user, entry)) return res.status(404).json({ error: 'No encontrado' })

    if (req.method === 'PATCH') {
      const b = req.body || {}
      // Se valida como una entrada completa (lo que no llega se queda como estaba)
      const checked = validateWorkItems(
        [
          {
            fecha: b.fecha ?? entry.work_date,
            titulo: b.titulo ?? entry.title,
            detalle: b.detalle !== undefined ? b.detalle : entry.detail,
            proyecto: b.proyecto_id !== undefined ? b.proyecto_id : entry.project_id,
            horas: b.horas !== undefined ? b.horas : entry.hours,
          },
        ],
        { today: todayMadrid(), projects: await workProjectsFor(entry.user_id) }
      )
      if (!checked.ok) return res.status(400).json({ error: checked.error.replace('Trabajo 1: ', '') })
      const item = checked.items[0]
      // Si no se cambia el proyecto, se deja el que tenía (aunque ya no esté abierto)
      if (b.proyecto_id === undefined) item.project_id = entry.project_id
      const updated = await updateWorkEntry(entry, item)
      return res.status(200).json({ entry: updated, warnings: b.proyecto_id === undefined ? [] : checked.warnings })
    }

    if (req.method === 'DELETE') {
      await deleteWorkEntry(entry.id)
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[api/trabajo/[id]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
