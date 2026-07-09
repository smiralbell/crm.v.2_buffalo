import type { NextApiRequest, NextApiResponse } from 'next'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TASK_UPLOAD_DIR } from '@/lib/gestion-proyecto/task-uploads'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const taskId = req.query.taskId as string
  const attachmentId = req.query.attachmentId as string
  if (!projectId || !taskId || !attachmentId) {
    return res.status(400).json({ error: 'IDs requeridos' })
  }

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const rows = await prisma.$queryRaw<
      { file_path: string; file_name: string; mime_type: string | null }[]
    >`
      SELECT file_path, file_name, mime_type
      FROM project_dev_task_attachments
      WHERE id = ${attachmentId}::uuid
        AND task_id = ${taskId}::uuid
        AND project_id = ${projectId}::uuid
      LIMIT 1
    `
    const att = rows[0]
    if (!att) return res.status(404).json({ error: 'Archivo no encontrado' })

    const buffer = await readFile(join(PROJECT_TASK_UPLOAD_DIR, att.file_path))
    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(att.file_name)}"`
    )
    return res.status(200).send(buffer)
  } catch (error) {
    console.error('[gestion-proyecto/task attachment file]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
