import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { findCrmUserById } from '@/lib/crm-users'
import {
  deletePersonalTask,
  getPersonalTask,
  reassignPersonalTask,
  updatePersonalTask,
} from '@/lib/tareas/store'
import { personalTaskUpdateSchema } from '@/lib/tareas/schemas'
import { canDeletePersonalTask, canEditPersonalTask } from '@/lib/tareas/permissions'
import { personalAttachmentDriveIds } from '@/lib/tareas/attachments'
import { trashAttachmentInDrive } from '@/lib/integrations/google/drive-attachments'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  const id = String(req.query.id ?? '')
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID no válido' })

  try {
    const task = await getPersonalTask(id)
    // Cada uno ve y toca sus tareas sueltas y las que creó; admin, todas.
    if (!task || !canEditPersonalTask(user, task)) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }

    if (req.method === 'PATCH') {
      const { user_id: newOwnerId, ...patch } = personalTaskUpdateSchema.parse(req.body)
      let current = task
      // Solo admin cambia de persona una tarea suelta
      if (newOwnerId !== undefined && newOwnerId !== task.owner_user_id) {
        if (user.role !== 'admin') {
          return res.status(403).json({ error: 'Solo un admin puede pasar la tarea a otra persona' })
        }
        const owner = await findCrmUserById(newOwnerId)
        if (!owner || !owner.active) return res.status(400).json({ error: 'Usuario no válido' })
        const moved = await reassignPersonalTask(task, owner.id)
        if (!moved) return res.status(404).json({ error: 'Tarea no encontrada' })
        current = moved
      }
      const hasOtherChanges = Object.values(patch).some((v) => v !== undefined)
      const updated = hasOtherChanges ? await updatePersonalTask(current, patch) : current
      if (!updated) return res.status(404).json({ error: 'Tarea no encontrada' })
      return res.status(200).json(updated)
    }

    if (req.method === 'DELETE') {
      if (!canDeletePersonalTask(user, task)) {
        return res
          .status(403)
          .json({ error: 'Esta tarea te la asignaron. Muévela a Hecho; solo quien la creó puede borrarla.' })
      }
      // Sus adjuntos a la papelera de Drive (se pueden recuperar allí 30 días)
      const driveIds = await personalAttachmentDriveIds(id).catch(() => [] as string[])
      await Promise.all(driveIds.map((fileId) => trashAttachmentInDrive(fileId).catch(() => undefined)))
      await deletePersonalTask(id)
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[api/tareas/[id]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
