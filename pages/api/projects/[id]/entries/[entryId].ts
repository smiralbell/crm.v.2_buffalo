import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const projectId = parseInt(String(req.query.id), 10)
  const entryId = parseInt(String(req.query.entryId), 10)
  if (Number.isNaN(projectId) || Number.isNaN(entryId)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method === 'DELETE') {
    try {
      const project = await prisma.evaluationProject.findFirst({
        where: { id: projectId, deleted_at: null },
      })
      if (!project) {
        return res.status(404).json({ error: 'Proyecto no encontrado' })
      }

      const entry = await prisma.projectJournalEntry.findFirst({
        where: { id: entryId, project_id: projectId },
      })
      if (!entry) {
        return res.status(404).json({ error: 'Entrada no encontrada' })
      }

      await prisma.projectJournalEntry.delete({ where: { id: entryId } })
      return res.status(204).end()
    } catch (e) {
      console.error('[entries entryId DELETE]', e)
      return res.status(500).json({ error: 'Error al eliminar la entrada' })
    }
  }

  res.setHeader('Allow', 'DELETE')
  return res.status(405).json({ error: 'Método no permitido' })
}
