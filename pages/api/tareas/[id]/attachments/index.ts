import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getPersonalTask } from '@/lib/tareas/store'
import { addPersonalAttachment, readUploadedFiles } from '@/lib/tareas/attachments'
import { isDriveAttachmentsConfigured, uploadAttachmentToDrive } from '@/lib/integrations/google/drive-attachments'

export const config = { api: { bodyParser: false } }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/tareas/[id]/attachments  (multipart, campo «file», varios)
 * Sube adjuntos a una tarea suelta. Se guardan en Google Drive:
 * <carpeta de adjuntos>/Tareas sueltas/<persona>/
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const id = String(req.query.id ?? '')
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID no válido' })

  try {
    const task = await getPersonalTask(id)
    if (!task || (user.role !== 'admin' && task.owner_user_id !== user.id)) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }
    if (!isDriveAttachmentsConfigured()) {
      return res.status(503).json({
        error: 'Falta configurar la carpeta de Drive para adjuntos (GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID)',
      })
    }

    const files = await readUploadedFiles(req)
    if (!files.length) return res.status(400).json({ error: 'Elige al menos un archivo' })

    const attachments = []
    for (const f of files) {
      const { fileId } = await uploadAttachmentToDrive({
        path: ['Tareas sueltas', task.assignee || 'Sin persona'],
        fileName: `${task.title.slice(0, 60)} - ${f.name}`,
        mimeType: f.mime,
        buffer: f.buffer,
      })
      attachments.push(
        await addPersonalAttachment({
          taskId: task.id,
          fileName: f.name,
          mimeType: f.mime,
          fileSize: f.buffer.length,
          driveFileId: fileId,
          uploadedBy: { id: user.id, name: user.name },
        })
      )
    }
    return res.status(201).json({ attachments })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[tareas/attachments upload]', err)
    return res.status(/ MB|archivo/.test(msg) ? 400 : 500).json({ error: msg })
  }
}
