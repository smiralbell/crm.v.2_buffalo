import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuthAPI(req, res)) return

  // ── GET — listar prospectos ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { zona, sector, estado, q, page = '1', limit = '50' } = req.query as Record<string, string>

    const where: Record<string, unknown> = { deleted_at: null }
    if (zona)   where.zona   = zona
    if (sector) where.sector = sector
    if (estado) where.estado = estado
    if (q) {
      where.OR = [
        { nombre:  { contains: q, mode: 'insensitive' } },
        { empresa: { contains: q, mode: 'insensitive' } },
        { telefono: { contains: q } },
        { email:   { contains: q, mode: 'insensitive' } },
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [total, prospects] = await Promise.all([
      prisma.coldCallProspect.count({ where } as Parameters<typeof prisma.coldCallProspect.count>[0]),
      prisma.coldCallProspect.findMany({
        where,
        include: {
          calls: {
            orderBy: { fecha: 'desc' },
            take: 1,
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: parseInt(limit),
      } as Parameters<typeof prisma.coldCallProspect.findMany>[0]),
    ])

    return res.json({ prospects, total, page: parseInt(page), limit: parseInt(limit) })
  }

  // ── POST — crear prospecto ──────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nombre, empresa, telefono, email, zona, sector, cargo, linkedin, web, notas, assigned_to } = req.body

    if (!nombre?.trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' })
    }

    const prospect = await prisma.coldCallProspect.create({
      data: { nombre, empresa, telefono, email, zona, sector, cargo, linkedin, web, notas, assigned_to },
    })

    return res.status(201).json(prospect)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
