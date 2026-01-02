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

      // Construir objeto de actualización solo con campos que cambiaron
      const updateData: any = {}
      const duplicateChecks: Promise<any>[] = []

      // Verificar y actualizar email solo si cambió
      if (data.email !== undefined) {
        if (data.email.trim() === '') {
          // Si se envía vacío, establecer como null
          if (currentContact.email !== null) {
            updateData.email = null
          }
        } else if (data.email !== currentContact.email) {
          // Agregar verificación de duplicados a la lista (se ejecutará en paralelo)
          duplicateChecks.push(
            prisma.contact.findUnique({
              where: { email: data.email },
              select: { id: true },
            }).then(existingContact => ({
              field: 'email',
              existingContact,
              value: data.email
            }))
          )
          updateData.email = data.email
        }
        // Si el email no cambió, no lo incluimos en updateData
      }

      // Verificar y actualizar instagram_user solo si cambió
      if (data.instagram_user !== undefined) {
        if (data.instagram_user.trim() === '') {
          // Si se envía vacío, establecer como null
          if (currentContact.instagram_user !== null) {
            updateData.instagram_user = null
          }
        } else if (data.instagram_user !== currentContact.instagram_user) {
          // Agregar verificación de duplicados a la lista (se ejecutará en paralelo)
          duplicateChecks.push(
            prisma.contact.findUnique({
              where: { instagram_user: data.instagram_user },
              select: { id: true },
            }).then(existingContact => ({
              field: 'instagram_user',
              existingContact,
              value: data.instagram_user
            }))
          )
          updateData.instagram_user = data.instagram_user
        }
        // Si el instagram_user no cambió, no lo incluimos en updateData
      }

      // Ejecutar todas las verificaciones de duplicados en paralelo
      if (duplicateChecks.length > 0) {
        const results = await Promise.all(duplicateChecks)
        
        for (const result of results) {
          // Si existe un contacto con ese valor Y no es el que estamos editando
          if (result.existingContact && result.existingContact.id !== id) {
            const errorMessage = result.field === 'email' 
              ? 'Ya existe un contacto con este email'
              : 'Ya existe un contacto con este usuario de Instagram'
            
            return res.status(409).json({ 
              error: errorMessage,
              contactId: result.existingContact.id
            })
          }
        }
      }

      // Agregar otros campos que no tienen restricción única
      if (data.nombre !== undefined) updateData.nombre = data.nombre
      if (data.telefono !== undefined) updateData.telefono = data.telefono
      if (data.empresa !== undefined) updateData.empresa = data.empresa
      if (data.direccion_fiscal !== undefined) updateData.direccion_fiscal = data.direccion_fiscal
      if (data.ciudad !== undefined) updateData.ciudad = data.ciudad
      if (data.codigo_postal !== undefined) updateData.codigo_postal = data.codigo_postal
      if (data.pais !== undefined) updateData.pais = data.pais
      if (data.cif !== undefined) updateData.cif = data.cif
      if (data.dni !== undefined) updateData.dni = data.dni
      if (data.iban !== undefined) updateData.iban = data.iban

      // Si no hay cambios, retornar el contacto actual sin actualizar
      if (Object.keys(updateData).length === 0) {
        // Ya tenemos currentContact, pero necesitamos todos los campos
        const contact = await prisma.contact.findUnique({
          where: { id },
        })
        return res.status(200).json(contact)
      }

      // Si hay cambios, proceder con la actualización
      // Usar update que retorna el objeto actualizado
      const contact = await prisma.contact.update({
        where: { id },
        data: updateData,
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

