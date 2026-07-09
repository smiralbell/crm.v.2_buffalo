import type { NextApiRequest, NextApiResponse } from 'next'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { PROJECT_ONBOARDING_UPLOAD_DIR } from '@/lib/gestion-proyecto/uploads'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const docId = req.query.docId as string
  if (!projectId || !docId) return res.status(400).json({ error: 'IDs requeridos' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const rows = await prisma.$queryRaw<
      {
        id: string
        doc_type: string
        file_path: string | null
        file_name: string | null
        mime_type: string | null
      }[]
    >`
      SELECT id, doc_type, file_path, file_name, mime_type
      FROM project_dev_onboarding_docs
      WHERE id = ${docId}::uuid
        AND project_id = ${projectId}::uuid
      LIMIT 1
    `
    const doc = rows[0]
    if (!doc || doc.doc_type !== 'file' || !doc.file_path) {
      return res.status(404).json({ error: 'Archivo no encontrado' })
    }

    const absolutePath = join(PROJECT_ONBOARDING_UPLOAD_DIR, doc.file_path)
    const buffer = await readFile(absolutePath)
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.file_name || 'documento')}"`
    )
    return res.status(200).send(buffer)
  } catch (error) {
    console.error('[gestion-proyecto/docs/file]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
