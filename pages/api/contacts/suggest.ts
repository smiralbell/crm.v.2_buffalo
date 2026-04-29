import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Búsqueda rápida para autocompletar cliente (nombre, empresa, email) */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const q = ((req.query.q as string) || '').trim()
  const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 12))

  try {
    const where =
      q.length > 0
        ? {
            OR: [
              { nombre: { contains: q, mode: 'insensitive' as const } },
              { empresa: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}

    const contacts = await prisma.contact.findMany({
      where,
      take: limit,
      orderBy: q.length > 0 ? [{ nombre: 'asc' }, { id: 'asc' }] : [{ created_at: 'desc' }],
      select: {
        id: true,
        nombre: true,
        empresa: true,
        email: true,
      },
    })

    const items = contacts.map((c) => {
      const parts = [c.nombre, c.empresa].filter(Boolean) as string[]
      const displayName = parts.length > 0 ? parts.join(' · ') : c.email || `Contacto #${c.id}`
      return {
        id: c.id,
        displayName,
        nombre: c.nombre,
        empresa: c.empresa,
        email: c.email,
      }
    })

    return res.status(200).json({ contacts: items })
  } catch (e) {
    console.error('[contacts/suggest]', e)
    return res.status(500).json({ error: 'Error al buscar contactos' })
  }
}
