import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createFixedExpenseSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))),
  has_iva: z.boolean().default(false),
  iva_percent: z.union([z.string(), z.number()]).transform((val) => val ? parseFloat(String(val)) : null).nullable().optional(),
  is_active: z.boolean().default(true),
  tags: z.array(z.string()).optional().default([]),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuth({ req, res } as any)
  } catch (error) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  if (req.method === 'GET') {
    try {
      const expenses = await prisma.fixedExpense.findMany({
        where: { deleted_at: null },
        orderBy: { name: 'asc' },
      })

      return res.status(200).json({
        expenses: expenses.map((e) => ({
          ...e,
          amount: Number(e.amount),
          iva_percent: e.iva_percent ? Number(e.iva_percent) : null,
        })),
      })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error fetching fixed expenses:', error)
      }
      return res.status(500).json({ error: 'Error al obtener gastos fijos' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createFixedExpenseSchema.parse(req.body)

      const expense = await prisma.fixedExpense.create({
        data: {
          name: data.name,
          amount: data.amount,
          has_iva: data.has_iva,
          iva_percent: data.iva_percent,
          is_active: data.is_active,
          tags: data.tags || [],
        },
      })

      return res.status(201).json({
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
        console.error('[ERROR] Error creating fixed expense:', error)
      }
      return res.status(500).json({ error: 'Error al crear gasto fijo' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

