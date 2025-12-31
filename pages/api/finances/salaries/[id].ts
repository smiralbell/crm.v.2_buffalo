import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateSalarySchema = z.object({
  person_name: z.string().min(1).optional(),
  date: z.string().optional(),
  amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).optional(),
  notes: z.string().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuth({ req, res } as any)
  } catch (error) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  const id = parseInt(req.query.id as string)

  if (req.method === 'GET') {
    try {
      const salary = await prisma.salary.findUnique({
        where: { id },
      })

      if (!salary || salary.deleted_at) {
        return res.status(404).json({ error: 'Nómina no encontrada' })
      }

      return res.status(200).json({
        salary: {
          ...salary,
          amount: Number(salary.amount),
          date: salary.date.toISOString(),
        },
      })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error fetching salary:', error)
      }
      return res.status(500).json({ error: 'Error al obtener nómina' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const data = updateSalarySchema.parse(req.body)

      const updateData: any = {}
      if (data.person_name) updateData.person_name = data.person_name
      if (data.date) updateData.date = new Date(data.date)
      if (data.amount !== undefined) updateData.amount = data.amount
      if (data.notes !== undefined) updateData.notes = data.notes

      const salary = await prisma.salary.update({
        where: { id },
        data: updateData,
      })

      return res.status(200).json({
        salary: {
          ...salary,
          amount: Number(salary.amount),
          date: salary.date.toISOString(),
        },
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error updating salary:', error)
      }
      return res.status(500).json({ error: 'Error al actualizar nómina' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.salary.update({
        where: { id },
        data: { deleted_at: new Date() },
      })

      return res.status(200).json({ message: 'Nómina eliminada' })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error deleting salary:', error)
      }
      return res.status(500).json({ error: 'Error al eliminar nómina' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

