import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'

const linkSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  url: z.string().url('URL inválida'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  const docId = req.query.docId as string | undefined
  if (!projectId) return res.status(400).json({ error: 'ID de proyecto requerido' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method === 'GET') {
      const rows = await prisma.$queryRaw<
        {
          id: string
          project_id: string
          title: string
          doc_type: string
          url: string | null
          file_name: string | null
          mime_type: string | null
          file_size: number | null
          created_at: Date
        }[]
      >`
        SELECT id, project_id, title, doc_type, url, file_name, mime_type, file_size, created_at
        FROM project_dev_onboarding_docs
        WHERE project_id = ${projectId}::uuid
        ORDER BY created_at DESC
      `
      return res.status(200).json({
        docs: rows.map((d) => ({ ...d, created_at: d.created_at.toISOString() })),
      })
    }

    if (req.method === 'POST') {
      const data = linkSchema.parse(req.body)
      const rows = await prisma.$queryRaw<
        {
          id: string
          project_id: string
          title: string
          doc_type: string
          url: string | null
          created_at: Date
        }[]
      >`
        INSERT INTO project_dev_onboarding_docs (project_id, title, doc_type, url)
        VALUES (${projectId}::uuid, ${data.title}, 'link', ${data.url})
        RETURNING id, project_id, title, doc_type, url, created_at
      `
      const doc = rows[0]
      return res.status(201).json({
        ...doc,
        created_at: doc.created_at.toISOString(),
      })
    }

    if (req.method === 'DELETE' && docId) {
      await prisma.$executeRaw`
        DELETE FROM project_dev_onboarding_docs
        WHERE id = ${docId}::uuid AND project_id = ${projectId}::uuid
      `
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[gestion-proyecto/docs]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
