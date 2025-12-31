import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateIncomeSchema = z.object({
  client_name: z.string().min(1).optional(),
  date: z.string().optional(),
  base_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).optional(),
  iva_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).optional(),
  total_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).optional(),
  status: z.enum(['pending', 'paid', 'estimated']).optional(),
  project: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuth({ req, res } as any)
  } catch (error) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  const { id } = req.query

  if (req.method === 'GET') {
    try {
      const income = await prisma.financialIncome.findUnique({
        where: { id: parseInt(id as string) },
      })

      if (!income || income.deleted_at) {
        return res.status(404).json({ error: 'Ingreso no encontrado' })
      }

      return res.status(200).json({
        income: {
          ...income,
          base_amount: Number(income.base_amount),
          iva_amount: Number(income.iva_amount),
          total_amount: Number(income.total_amount),
          date: income.date.toISOString(),
        },
      })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error fetching income:', error)
      }
      return res.status(500).json({ error: 'Error al obtener ingreso' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const data = updateIncomeSchema.parse(req.body)

      const updateData: any = {}
      if (data.client_name) updateData.client_name = data.client_name
      if (data.date) updateData.date = new Date(data.date)
      if (data.base_amount !== undefined) updateData.base_amount = data.base_amount
      if (data.iva_amount !== undefined) updateData.iva_amount = data.iva_amount
      if (data.total_amount !== undefined) updateData.total_amount = data.total_amount
      if (data.status) updateData.status = data.status
      if (data.project !== undefined) updateData.project = data.project
      if (data.notes !== undefined) updateData.notes = data.notes

      const income = await prisma.financialIncome.update({
        where: { id: parseInt(id as string) },
        data: updateData,
      })

      return res.status(200).json({
        income: {
          ...income,
          base_amount: Number(income.base_amount),
          iva_amount: Number(income.iva_amount),
          total_amount: Number(income.total_amount),
          date: income.date.toISOString(),
        },
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error updating income:', error)
      }
      return res.status(500).json({ error: 'Error al actualizar ingreso' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.financialIncome.update({
        where: { id: parseInt(id as string) },
        data: { deleted_at: new Date() },
      })

      return res.status(200).json({ message: 'Ingreso eliminado' })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error deleting income:', error)
      }
      return res.status(500).json({ error: 'Error al eliminar ingreso' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

