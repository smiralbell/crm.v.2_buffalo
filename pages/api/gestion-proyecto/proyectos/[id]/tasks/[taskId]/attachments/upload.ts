import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { ensureTaskUploadDir } from '@/lib/gestion-proyecto/task-uploads'

export const config = { api: { bodyParser: false } }

function parseForm(req: NextApiRequest) {
  return new Promise<{ files: formidable.Files }>((resolve, reject) => {
    const form = formidable({ multiples: true })
    form.parse(req, (err, _fields, files) => {
      if (err) reject(err)
      else resolve({ files })
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const taskId = req.query.taskId as string
  if (!projectId || !taskId) return res.status(400).json({ error: 'IDs requeridos' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const task = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM project_dev_tasks
      WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
      LIMIT 1
    `
    if (!task[0]) return res.status(404).json({ error: 'Tarea no encontrada' })

    const { files } = await parseForm(req)
    const uploaded = files.file || files.files
    const entries = Array.isArray(uploaded) ? uploaded : uploaded ? [uploaded] : []
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Debes subir al menos un archivo' })
    }

    const dir = await ensureTaskUploadDir(projectId, taskId)
    const saved = []

    for (const fileEntry of entries) {
      if (!fileEntry?.filepath) continue
      const buffer = await readFile(fileEntry.filepath)
      const safeName = (fileEntry.originalFilename || 'archivo').replace(/[^\w.\-() ]+/g, '_')
      const storedName = `${Date.now()}_${safeName}`
      await writeFile(join(dir, storedName), buffer)
      const relativePath = join(projectId, taskId, storedName).replace(/\\/g, '/')

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
          task_id, project_id, file_name, file_path, mime_type, file_size
        ) VALUES (
          ${taskId}::uuid,
          ${projectId}::uuid,
          ${safeName},
          ${relativePath},
          ${fileEntry.mimetype || 'application/octet-stream'},
          ${buffer.length}
        )
        RETURNING id, task_id, file_name, mime_type, file_size, created_at
      `
      const row = rows[0]
      saved.push({
        ...row,
        created_at: row.created_at.toISOString(),
      })
    }

    return res.status(201).json({ attachments: saved })
  } catch (error) {
    console.error('[gestion-proyecto/task attachments upload]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
