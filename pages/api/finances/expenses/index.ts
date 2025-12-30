import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createExpenseSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  date_start: z.string(),
  date_end: z.string(),
  base_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))),
  iva_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).default(0),
  total_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))),
  tags: z.array(z.string()).optional().default([]),
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

  if (req.method === 'GET') {
    try {
      const month = req.query.month as string
      let where: any = { deleted_at: null }

      if (month) {
        const year = parseInt(month.split('-')[0])
        const monthNum = parseInt(month.split('-')[1])
        const startDate = new Date(year, monthNum - 1, 1)
        const endDate = new Date(year, monthNum, 0)
        where.date = { gte: startDate, lte: endDate }
      }

      const expenses = await prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
      })

      return res.status(200).json({
        expenses: expenses.map((e) => ({
          ...e,
          base_amount: Number(e.base_amount),
          iva_amount: Number(e.iva_amount),
          total_amount: Number(e.total_amount),
          date: e.date.toISOString(),
        })),
      })
    } catch (error: any) {
      console.error('Error fetching expenses:', error)
      return res.status(500).json({ error: 'Error al obtener gastos' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createExpenseSchema.parse(req.body)

      const expense = await prisma.expense.create({
        data: {
          name: data.name,
          date_start: new Date(data.date_start),
          date_end: new Date(data.date_end),
          base_amount: data.base_amount,
          iva_amount: data.iva_amount,
          total_amount: data.total_amount,
          tags: data.tags || [],
          person_name: data.person_name,
          project: data.project,
          client_name: data.client_name,
          notes: data.notes,
        },
      })

      return res.status(201).json({
        expense: {
          ...expense,
          base_amount: Number(expense.base_amount),
          iva_amount: Number(expense.iva_amount),
          total_amount: Number(expense.total_amount),
          date_start: expense.date_start.toISOString(),
          date_end: expense.date_end.toISOString(),
        },
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      console.error('Error creating expense:', error)
      return res.status(500).json({ error: 'Error al crear gasto' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

