import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { ensureProjectUploadDir } from '@/lib/gestion-proyecto/uploads'

export const config = { api: { bodyParser: false } }

function parseForm(req: NextApiRequest) {
  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    const form = formidable({ multiples: false })
    form.parse(req, (err, fields, files) => {
      if (err) reject(err)
      else resolve({ fields, files })
    })
  })
}

function fieldValue(fields: formidable.Fields, key: string): string {
  const raw = fields[key]
  if (Array.isArray(raw)) return String(raw[0] ?? '').trim()
  return String(raw ?? '').trim()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  if (!projectId) return res.status(400).json({ error: 'ID de proyecto requerido' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { fields, files } = await parseForm(req)
    const title = fieldValue(fields, 'title') || 'Documento'
    const uploaded = files.file
    const fileEntry = Array.isArray(uploaded) ? uploaded[0] : uploaded
    if (!fileEntry?.filepath) {
      return res.status(400).json({ error: 'Debes subir un archivo' })
    }

    const buffer = await readFile(fileEntry.filepath)
    const safeName = (fileEntry.originalFilename || 'documento').replace(/[^\w.\-() ]+/g, '_')
    const storedName = `${Date.now()}_${safeName}`
    const dir = await ensureProjectUploadDir(projectId)
    const storedPath = join(dir, storedName)
    await writeFile(storedPath, buffer)

    const relativePath = join(projectId, storedName).replace(/\\/g, '/')
    const rows = await prisma.$queryRaw<
      {
        id: string
        project_id: string
        title: string
        doc_type: string
        file_name: string | null
        mime_type: string | null
        file_size: number | null
        created_at: Date
      }[]
    >`
      INSERT INTO project_dev_onboarding_docs (
        project_id, title, doc_type, file_path, file_name, mime_type, file_size
      ) VALUES (
        ${projectId}::uuid,
        ${title},
        'file',
        ${relativePath},
        ${safeName},
        ${fileEntry.mimetype || 'application/octet-stream'},
        ${buffer.length}
      )
      RETURNING id, project_id, title, doc_type, file_name, mime_type, file_size, created_at
    `

    const doc = rows[0]
    return res.status(201).json({
      ...doc,
      created_at: doc.created_at.toISOString(),
    })
  } catch (error) {
    console.error('[gestion-proyecto/docs/upload]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
