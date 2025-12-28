import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const leadSchema = z.object({
  contact_id: z.number(), // Requerido según la estructura real
  estado: z.string().optional(), // Puede ser cualquier string, no solo los enum
  valor: z.number().optional().nullable(),
  notas: z.string().optional().nullable(),
  origen_principal: z.string().optional().nullable(),
  prioridad: z.string().optional().nullable(),
  score: z.number().optional().nullable(),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requireAuthAPI(req, res)

    if (req.method === 'GET') {
      const page = parseInt(req.query.page as string) || 1
      const search = (req.query.search as string) || ''
      const estado = (req.query.estado as string) || ''
      const pageSize = 10
      const skip = (page - 1) * pageSize

      const where: any = {}

      if (estado) {
        where.estado = estado
      }

      if (search) {
        where.contact = {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      }

      const [leads, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { created_at: 'desc' },
          include: {
            contact: {
              select: {
                id: true,
                nombre: true,
                email: true,
              },
            },
          },
        }),
        prisma.lead.count({ where }),
      ])

      return res.status(200).json({
        leads,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    }

    if (req.method === 'POST') {
      const data = leadSchema.parse(req.body)

      const lead = await prisma.lead.create({
        data: {
          contact_id: data.contact_id,
          estado: data.estado || 'frio',
          valor: data.valor || null,
          notas: data.notas || null,
          origen_principal: data.origen_principal || null,
          prioridad: data.prioridad || 'media',
          score: data.score || null,
        },
      })

      return res.status(201).json(lead)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }

    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session')) {
      return // Ya se envió la respuesta 401
    }

    console.error('Leads API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

