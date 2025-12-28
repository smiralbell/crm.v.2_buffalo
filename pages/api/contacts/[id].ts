import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const contactUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').optional(),
  email: z.string().email('Email inválido').optional(),
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

    const id = parseInt(req.query.id as string)

    if (req.method === 'GET') {
      const contact = await prisma.contact.findUnique({
        where: { id },
        include: {
          leads: {
            orderBy: { created_at: 'desc' },
          },
        },
      })

      if (!contact) {
        return res.status(404).json({ error: 'Contacto no encontrado' })
      }

      return res.status(200).json(contact)
    }

    if (req.method === 'PUT') {
      const data = contactUpdateSchema.parse(req.body)

      const contact = await prisma.contact.update({
        where: { id },
        data,
      })

      return res.status(200).json(contact)
    }

    if (req.method === 'DELETE') {
      await prisma.contact.delete({
        where: { id },
      })

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }

    if (error instanceof Error && (error.message === 'No session' || error.message === 'Invalid session' || error.message === 'Expired session')) {
      return // Ya se envió la respuesta 401
    }

    console.error('Contact API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

