import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return

  const id = parseInt(req.query.id as string)
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const prospect = await prisma.coldCallProspect.findFirst({
      where: { id, deleted_at: null },
      include: {
        calls: { orderBy: { fecha: 'desc' } },
      },
    })
    if (!prospect) return res.status(404).json({ error: 'No encontrado' })
    return res.json(prospect)
  }

  // ── PATCH ────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const fields = ['nombre','empresa','telefono','email','zona','sector','cargo','linkedin','web','notas','assigned_to','estado']
    const data: Record<string, unknown> = { updated_at: new Date() }
    for (const f of fields) {
      if (f in req.body) data[f] = req.body[f]
    }
    const prospect = await prisma.coldCallProspect.update({ where: { id }, data })
    return res.json(prospect)
  }

  // ── DELETE (soft) ────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await prisma.coldCallProspect.update({
      where: { id },
      data: { deleted_at: new Date() },
    })
    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
