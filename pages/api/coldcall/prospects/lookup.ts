import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assertProspectAccess, getColdCallScope } from '@/lib/coldcall/scope'
import { getColdCallProspectDisplayMap } from '@/lib/pipelines/cold-calling'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const raw = req.query.ids
    const idStrings = typeof raw === 'string' ? raw.split(',') : []
    const ids = idStrings.map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n))
    if (ids.length === 0) return res.status(400).json({ error: 'ids es obligatorio' })

    const scope = await getColdCallScope(user)
    for (const id of ids) {
      try {
        await assertProspectAccess(scope, id)
      } catch {
        return res.status(403).json({ error: 'Acceso denegado' })
      }
    }

    const allowed = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM coldcall_prospects
      WHERE id = ANY(${ids}::int[]) AND deleted_at IS NULL
    `
    const map = await getColdCallProspectDisplayMap(allowed.map((r) => String(r.id)))
    return res.status(200).json(map)
  } catch {
    return
  }
}
