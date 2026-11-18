import type { NextApiRequest, NextApiResponse } from 'next'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TASK_UPLOAD_DIR, ensureProjectAttachmentDriveColumn } from '@/lib/gestion-proyecto/task-uploads'
import { contentDisposition } from '@/lib/tareas/attachments'
import { downloadAttachmentFromDrive } from '@/lib/integrations/google/drive-attachments'

/** GET: el archivo adjunto (desde Drive o, si es antiguo, desde el disco). ?download=1 para descargar. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const taskId = req.query.taskId as string
  const attachmentId = req.query.attachmentId as string
  if (!projectId || !taskId || !attachmentId) {
    return res.status(400).json({ error: 'IDs requeridos' })
  }

  try {
    await requireProjectAccessAPI(req, res, projectId)
    if (res.headersSent) return

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    await ensureProjectAttachmentDriveColumn()
    const rows = await prisma.$queryRaw<
      { file_path: string; file_name: string; mime_type: string | null; drive_file_id: string | null }[]
    >`
      SELECT file_path, file_name, mime_type, drive_file_id
      FROM project_dev_task_attachments
      WHERE id = ${attachmentId}::uuid
        AND task_id = ${taskId}::uuid
        AND project_id = ${projectId}::uuid
      LIMIT 1
    `
    const att = rows[0]
    if (!att) return res.status(404).json({ error: 'Archivo no encontrado' })

    const buffer = att.drive_file_id
      ? await downloadAttachmentFromDrive(att.drive_file_id)
      : await readFile(join(PROJECT_TASK_UPLOAD_DIR, att.file_path))
    const mime = att.mime_type || 'application/octet-stream'
    const inline = req.query.download !== '1' && /^(image\/|application\/pdf|text\/plain)/.test(mime)
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', contentDisposition(att.file_name, inline))
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).send(buffer)
  } catch (error) {
    if (res.headersSent) return
    console.error('[gestion-proyecto/task attachment file]', error)
    return res.status(500).json({ error: 'No se pudo abrir el archivo' })
  }
}
