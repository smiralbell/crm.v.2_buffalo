import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  client_name: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  opened_at: z.string().optional().nullable(),
  closed_at: z.string().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = parseInt(String(req.query.id), 10)
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method === 'GET') {
    try {
      const project = await prisma.evaluationProject.findFirst({
        where: { id, deleted_at: null },
        include: {
          entries: { orderBy: { created_at: 'desc' } },
          analyses: { orderBy: { created_at: 'desc' }, take: 1 },
        },
      })
      if (!project) {
        return res.status(404).json({ error: 'Proyecto no encontrado' })
      }

      const ratings = project.entries.filter((e) => e.rating != null).map((e) => e.rating as number)
      const avg_rating =
        ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null

      const now = new Date()
      const end = project.closed_at ?? now
      const days_open = Math.max(0, Math.floor((end.getTime() - project.opened_at.getTime()) / 86_400_000))

      const latestEntry = project.entries[0] ?? null
      const latestAnalysis = project.analyses[0] ?? null

      return res.status(200).json({
        project: {
          id: project.id,
          name: project.name,
          client_name: project.client_name,
          is_active: project.is_active,
          tags: project.tags,
          opened_at: project.opened_at.toISOString(),
          closed_at: project.closed_at?.toISOString() ?? null,
          updated_at: project.updated_at.toISOString(),
          days_open,
          avg_rating,
        },
        entries: project.entries.map((e) => ({
          id: e.id,
          body: e.body,
          rating: e.rating,
          created_at: e.created_at.toISOString(),
        })),
        latest_analysis: latestAnalysis
          ? {
              id: latestAnalysis.id,
              summary_json: latestAnalysis.summary_json,
              model: latestAnalysis.model,
              created_at: latestAnalysis.created_at.toISOString(),
            }
          : null,
        last_entry_for_context: latestEntry
          ? { body: latestEntry.body, created_at: latestEntry.created_at.toISOString() }
          : null,
      })
    } catch (e) {
      console.error('[projects id GET]', e)
      return res.status(500).json({ error: 'Error al cargar proyecto' })
    }
  }

  if (req.method === 'PATCH') {
    try {
      const existing = await prisma.evaluationProject.findFirst({ where: { id, deleted_at: null } })
      if (!existing) {
        return res.status(404).json({ error: 'Proyecto no encontrado' })
      }

      const data = patchSchema.parse(req.body)
      let closed_at = existing.closed_at
      if (data.is_active === false && !existing.closed_at) {
        closed_at = new Date()
      }
      if (data.is_active === true) {
        closed_at = null
      }
      if (data.closed_at !== undefined) {
        closed_at = data.closed_at ? new Date(data.closed_at) : null
      }

      const updated = await prisma.evaluationProject.update({
        where: { id },
        data: {
          ...(data.name != null ? { name: data.name } : {}),
          ...(data.client_name !== undefined ? { client_name: data.client_name } : {}),
          ...(data.is_active != null ? { is_active: data.is_active } : {}),
          ...(data.tags != null ? { tags: data.tags } : {}),
          ...(data.is_active != null || data.closed_at !== undefined ? { closed_at } : {}),
          ...(data.opened_at !== undefined
            ? { opened_at: data.opened_at ? new Date(data.opened_at) : existing.opened_at }
            : {}),
        },
      })

      return res.status(200).json({
        project: {
          id: updated.id,
          name: updated.name,
          client_name: updated.client_name,
          is_active: updated.is_active,
          tags: updated.tags,
          opened_at: updated.opened_at.toISOString(),
          closed_at: updated.closed_at?.toISOString() ?? null,
        },
      })
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.flatten() })
      }
      console.error('[projects id PATCH]', e)
      return res.status(500).json({ error: 'Error al actualizar' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const existing = await prisma.evaluationProject.findFirst({ where: { id, deleted_at: null } })
      if (!existing) {
        return res.status(404).json({ error: 'Proyecto no encontrado' })
      }
      await prisma.evaluationProject.update({
        where: { id },
        data: { deleted_at: new Date() },
      })
      return res.status(204).end()
    } catch (e) {
      console.error('[projects id DELETE]', e)
      return res.status(500).json({ error: 'Error al eliminar' })
    }
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE')
  return res.status(405).json({ error: 'Método no permitido' })
}
