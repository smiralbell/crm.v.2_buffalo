import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

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

      // Obtener el contacto actual para comparar valores
      const currentContact = await prisma.contact.findUnique({
        where: { id },
        select: { email: true, instagram_user: true },
      })

      if (!currentContact) {
        return res.status(404).json({ error: 'Contacto no encontrado' })
      }

      // Verificar duplicados solo si el valor cambió y no está vacío
      if (data.email && data.email.trim() !== '' && data.email !== currentContact.email) {
        const existingContact = await prisma.contact.findUnique({
          where: { email: data.email },
          select: { id: true },
        })
        
        // Si existe un contacto con ese email Y no es el que estamos editando
        if (existingContact && existingContact.id !== id) {
          return res.status(409).json({ 
            error: 'Ya existe un contacto con este email',
            contactId: existingContact.id
          })
        }
      }

      if (data.instagram_user && data.instagram_user.trim() !== '' && data.instagram_user !== currentContact.instagram_user) {
        const existingContact = await prisma.contact.findUnique({
          where: { instagram_user: data.instagram_user },
          select: { id: true },
        })
        
        // Si existe un contacto con ese instagram_user Y no es el que estamos editando
        if (existingContact && existingContact.id !== id) {
          return res.status(409).json({ 
            error: 'Ya existe un contacto con este usuario de Instagram',
            contactId: existingContact.id
          })
        }
      }

      // Si no hay duplicados, proceder con la actualización
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

    // Manejar otros errores de Prisma que no fueron capturados en el PUT
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Ya existe un contacto con estos datos' })
      }
    }

    console.error('Contact API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

