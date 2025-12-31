import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateFixedExpenseSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).optional(),
  has_iva: z.boolean().optional(),
  iva_percent: z.union([z.string(), z.number()]).transform((val) => val ? parseFloat(String(val)) : null).nullable().optional(),
  is_active: z.boolean().optional(),
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
      const expense = await prisma.fixedExpense.findUnique({
        where: { id },
      })

      if (!expense || expense.deleted_at) {
        return res.status(404).json({ error: 'Gasto fijo no encontrado' })
      }

      return res.status(200).json({
        expense: {
          ...expense,
          amount: Number(expense.amount),
          iva_percent: expense.iva_percent ? Number(expense.iva_percent) : null,
        },
      })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error fetching fixed expense:', error)
      }
      return res.status(500).json({ error: 'Error al obtener gasto fijo' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const data = updateFixedExpenseSchema.parse(req.body)

      const expense = await prisma.fixedExpense.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.amount !== undefined && { amount: data.amount }),
          ...(data.has_iva !== undefined && { has_iva: data.has_iva }),
          ...(data.iva_percent !== undefined && { iva_percent: data.iva_percent }),
          ...(data.is_active !== undefined && { is_active: data.is_active }),
        },
      })

      return res.status(200).json({
        expense: {
          ...expense,
          amount: Number(expense.amount),
          iva_percent: expense.iva_percent ? Number(expense.iva_percent) : null,
        },
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error updating fixed expense:', error)
      }
      return res.status(500).json({ error: 'Error al actualizar gasto fijo' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.fixedExpense.update({
        where: { id },
        data: { deleted_at: new Date() },
      })

      return res.status(200).json({ message: 'Gasto fijo eliminado' })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error deleting fixed expense:', error)
      }
      return res.status(500).json({ error: 'Error al eliminar gasto fijo' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

