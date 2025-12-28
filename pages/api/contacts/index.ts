import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const contactSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Email inválido'),
  telefono: z.string().optional(),
  empresa: z.string().optional(),
  instagram_user: z.string().optional(),
  direccion_fiscal: z.string().optional(),
  ciudad: z.string().optional(),
  codigo_postal: z.string().optional(),
  pais: z.string().optional(),
  cif: z.string().optional(),
  dni: z.string().optional(),
  iban: z.string().optional(),
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
      const pageSize = 10
      const skip = (page - 1) * pageSize

      const where = search
        ? {
            OR: [
              { nombre: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { created_at: 'desc' },
        }),
        prisma.contact.count({ where }),
      ])

      return res.status(200).json({
        contacts,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    }

    if (req.method === 'POST') {
      const data = contactSchema.parse(req.body)

      const contact = await prisma.contact.create({
        data,
      })

      return res.status(201).json(contact)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }

    if (error instanceof Error && error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session') {
      return // Ya se envió la respuesta 401
    }

    console.error('Contacts API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

