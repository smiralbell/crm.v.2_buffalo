import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const leadUpdateSchema = z.object({
  contact_id: z.number().optional(),
  estado: z.string().optional(),
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

    const id = parseInt(req.query.id as string)

    if (req.method === 'GET') {
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: {
          contact: {
            select: {
              id: true,
              nombre: true,
              email: true,
            },
          },
        },
      })

      if (!lead) {
        return res.status(404).json({ error: 'Lead no encontrado' })
      }

      return res.status(200).json(lead)
    }

    if (req.method === 'PUT') {
      const data = leadUpdateSchema.parse(req.body)

      const updateData: any = {}
      if (data.contact_id !== undefined) updateData.contact_id = data.contact_id
      if (data.estado !== undefined) updateData.estado = data.estado
      if (data.valor !== undefined) updateData.valor = data.valor
      if (data.notas !== undefined) updateData.notas = data.notas
      if (data.origen_principal !== undefined) updateData.origen_principal = data.origen_principal
      if (data.prioridad !== undefined) updateData.prioridad = data.prioridad
      if (data.score !== undefined) updateData.score = data.score

      const lead = await prisma.lead.update({
        where: { id },
        data: updateData,
      })

      return res.status(200).json(lead)
    }

    if (req.method === 'DELETE') {
      await prisma.lead.delete({
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

    console.error('Lead API error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}

