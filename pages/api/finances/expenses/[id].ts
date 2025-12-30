import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateExpenseSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().optional(),
  base_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).optional(),
  iva_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).optional(),
  total_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).optional(),
  person_name: z.string().optional().nullable(),
  project: z.string().optional().nullable(),
  client_name: z.string().optional().nullable(),
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
      const expense = await prisma.expense.findUnique({
        where: { id },
      })

      if (!expense || expense.deleted_at) {
        return res.status(404).json({ error: 'Gasto no encontrado' })
      }

      return res.status(200).json({
        expense: {
          ...expense,
          base_amount: Number(expense.base_amount),
          iva_amount: Number(expense.iva_amount),
          total_amount: Number(expense.total_amount),
          date: expense.date.toISOString(),
        },
      })
    } catch (error: any) {
      console.error('Error fetching expense:', error)
      return res.status(500).json({ error: 'Error al obtener gasto' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const data = updateExpenseSchema.parse(req.body)

      const updateData: any = {}
      if (data.name) updateData.name = data.name
      if (data.date) updateData.date = new Date(data.date)
      if (data.base_amount !== undefined) updateData.base_amount = data.base_amount
      if (data.iva_amount !== undefined) updateData.iva_amount = data.iva_amount
      if (data.total_amount !== undefined) updateData.total_amount = data.total_amount
      if (data.person_name !== undefined) updateData.person_name = data.person_name
      if (data.project !== undefined) updateData.project = data.project
      if (data.client_name !== undefined) updateData.client_name = data.client_name
      if (data.notes !== undefined) updateData.notes = data.notes

      const expense = await prisma.expense.update({
        where: { id },
        data: updateData,
      })

      return res.status(200).json({
        expense: {
          ...expense,
          base_amount: Number(expense.base_amount),
          iva_amount: Number(expense.iva_amount),
          total_amount: Number(expense.total_amount),
          date: expense.date.toISOString(),
        },
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      console.error('Error updating expense:', error)
      return res.status(500).json({ error: 'Error al actualizar gasto' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.expense.update({
        where: { id },
        data: { deleted_at: new Date() },
      })

      return res.status(200).json({ message: 'Gasto eliminado' })
    } catch (error: any) {
      console.error('Error deleting expense:', error)
      return res.status(500).json({ error: 'Error al eliminar gasto' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

