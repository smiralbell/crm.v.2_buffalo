import type { NextApiRequest, NextApiResponse } from 'next'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TASK_UPLOAD_DIR, ensureProjectAttachmentDriveColumn } from '@/lib/gestion-proyecto/task-uploads'
import { trashAttachmentInDrive } from '@/lib/integrations/google/drive-attachments'

/** DELETE: quita un adjunto de una tarea de proyecto (a la papelera de Drive, o del disco si es antiguo). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const taskId = req.query.taskId as string
  const attachmentId = req.query.attachmentId as string
  if (!projectId || !taskId || !attachmentId) return res.status(400).json({ error: 'IDs requeridos' })

  try {
    await requireProjectAccessAPI(req, res, projectId)
    if (res.headersSent) return
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

    await ensureProjectAttachmentDriveColumn()
    const rows = await prisma.$queryRaw<{ id: string; file_path: string; drive_file_id: string | null }[]>`
      SELECT id, file_path, drive_file_id
      FROM project_dev_task_attachments
      WHERE id = ${attachmentId}::uuid AND task_id = ${taskId}::uuid AND project_id = ${projectId}::uuid
      LIMIT 1
    `
    const att = rows[0]
    if (!att) return res.status(404).json({ error: 'Archivo no encontrado' })

    if (att.drive_file_id) await trashAttachmentInDrive(att.drive_file_id)
    else if (att.file_path) await unlink(join(PROJECT_TASK_UPLOAD_DIR, att.file_path)).catch(() => undefined)

    await prisma.$executeRaw`DELETE FROM project_dev_task_attachments WHERE id = ${attachmentId}::uuid`
    return res.status(200).json({ ok: true })
  } catch (error) {
    if (res.headersSent) return
    console.error('[gestion-proyecto/task attachment delete]', error)
    return res.status(500).json({ error: 'No se pudo quitar el archivo' })
  }
}
