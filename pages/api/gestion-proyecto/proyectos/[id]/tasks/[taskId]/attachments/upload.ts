import type { NextApiRequest, NextApiResponse } from 'next'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { ensureProjectAttachmentDriveColumn, ensureTaskUploadDir } from '@/lib/gestion-proyecto/task-uploads'
import { readUploadedFiles } from '@/lib/tareas/attachments'
import { isDriveAttachmentsConfigured, uploadAttachmentToDrive } from '@/lib/integrations/google/drive-attachments'

export const config = { api: { bodyParser: false } }

/**
 * POST: adjuntos de una tarea de proyecto. Con GOOGLE_DRIVE_ATTACHMENTS_FOLDER_ID
 * van a Drive (<carpeta>/Tareas de proyectos/<proyecto>/); si no, al disco como antes.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const taskId = req.query.taskId as string
  if (!projectId || !taskId) return res.status(400).json({ error: 'IDs requeridos' })

  try {
    await requireProjectAccessAPI(req, res, projectId)
    if (res.headersSent) return

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const task = await prisma.$queryRaw<{ id: string; title: string; project_name: string | null }[]>`
      SELECT t.id, t.title, p.name AS project_name
      FROM project_dev_tasks t
      LEFT JOIN proyectos p ON p.id = t.project_id
      WHERE t.id = ${taskId}::uuid AND t.project_id = ${projectId}::uuid
      LIMIT 1
    `
    if (!task[0]) return res.status(404).json({ error: 'Tarea no encontrada' })

    let files
    try {
      files = await readUploadedFiles(req)
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'No se pudo leer el archivo' })
    }
    if (files.length === 0) {
      return res.status(400).json({ error: 'Debes subir al menos un archivo' })
    }

    await ensureProjectAttachmentDriveColumn()
    const toDrive = isDriveAttachmentsConfigured()
    const saved = []

    for (const f of files) {
      const safeName = f.name.replace(/[^\w.\-() áéíóúÁÉÍÓÚñÑüÜ]+/g, '_')
      let relativePath = ''
      let driveFileId: string | null = null

      if (toDrive) {
        const up = await uploadAttachmentToDrive({
          path: ['Tareas de proyectos', task[0].project_name || 'Proyecto'],
          fileName: `${task[0].title.slice(0, 60)} - ${f.name}`,
          mimeType: f.mime,
          buffer: f.buffer,
        })
        driveFileId = up.fileId
      } else {
        const dir = await ensureTaskUploadDir(projectId, taskId)
        const storedName = `${Date.now()}_${safeName}`
        await writeFile(join(dir, storedName), f.buffer)
        relativePath = join(projectId, taskId, storedName).replace(/\\/g, '/')
      }

      const rows = await prisma.$queryRaw<
        {
          id: string
          task_id: string
          file_name: string
          mime_type: string | null
          file_size: number | null
          created_at: Date
        }[]
      >`
        INSERT INTO project_dev_task_attachments (
          task_id, project_id, file_name, file_path, mime_type, file_size, drive_file_id
        ) VALUES (
          ${taskId}::uuid,
          ${projectId}::uuid,
          ${f.name},
          ${relativePath},
          ${f.mime},
          ${f.buffer.length},
          ${driveFileId}
        )
        RETURNING id, task_id, file_name, mime_type, file_size, created_at
      `
      const row = rows[0]
      saved.push({ ...row, created_at: row.created_at.toISOString() })
    }

    return res.status(201).json({ attachments: saved })
  } catch (error) {
    if (res.headersSent) return
    console.error('[gestion-proyecto/task attachments upload]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno del servidor' })
  }
}
