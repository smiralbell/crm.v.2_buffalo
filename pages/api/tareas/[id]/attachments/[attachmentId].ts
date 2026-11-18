import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getPersonalTask } from '@/lib/tareas/store'
import { contentDisposition, deletePersonalAttachmentRow, getPersonalAttachment } from '@/lib/tareas/attachments'
import { downloadAttachmentFromDrive, trashAttachmentInDrive } from '@/lib/integrations/google/drive-attachments'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET    /api/tareas/[id]/attachments/[attachmentId]            → el archivo (?download=1 para descargar)
 * DELETE /api/tareas/[id]/attachments/[attachmentId]            → lo quita (a la papelera de Drive)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }
  const id = String(req.query.id ?? '')
  const attachmentId = String(req.query.attachmentId ?? '')
  if (!UUID_RE.test(id) || !UUID_RE.test(attachmentId)) return res.status(400).json({ error: 'ID no válido' })

  try {
    const task = await getPersonalTask(id)
    if (!task || (user.role !== 'admin' && task.owner_user_id !== user.id)) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }
    const att = await getPersonalAttachment(id, attachmentId)
    if (!att) return res.status(404).json({ error: 'Archivo no encontrado' })

    if (req.method === 'GET') {
      const buffer = await downloadAttachmentFromDrive(att.drive_file_id)
      const mime = att.mime_type || 'application/octet-stream'
      const inline = req.query.download !== '1' && /^(image\/|application\/pdf|text\/plain)/.test(mime)
      res.setHeader('Content-Type', mime)
      res.setHeader('Content-Disposition', contentDisposition(att.file_name, inline))
      res.setHeader('Cache-Control', 'private, max-age=300')
      return res.status(200).send(buffer)
    }

    if (req.method === 'DELETE') {
      await trashAttachmentInDrive(att.drive_file_id)
      await deletePersonalAttachmentRow(att.id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (err) {
    console.error('[tareas/attachment]', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' })
  }
}
