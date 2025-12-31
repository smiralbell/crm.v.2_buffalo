import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createIncomeSchema = z.object({
  client_name: z.string().min(1, 'El nombre del cliente es requerido'),
  date: z.string(),
  base_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))),
  iva_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))).default(0),
  total_amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))),
  status: z.enum(['pending', 'paid', 'estimated']).default('pending'),
  project: z.string().optional().nullable(),
  invoice_id: z.number().optional().nullable(),
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

      const incomes = await prisma.financialIncome.findMany({
        where,
        orderBy: { date: 'desc' },
      })

      return res.status(200).json({
        incomes: incomes.map((i) => ({
          ...i,
          base_amount: Number(i.base_amount),
          iva_amount: Number(i.iva_amount),
          total_amount: Number(i.total_amount),
          date: i.date.toISOString(),
        })),
      })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error fetching incomes:', error)
      }
      return res.status(500).json({ error: 'Error al obtener ingresos' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createIncomeSchema.parse(req.body)

      const income = await prisma.financialIncome.create({
        data: {
          client_name: data.client_name,
          date: new Date(data.date),
          base_amount: data.base_amount,
          iva_amount: data.iva_amount,
          total_amount: data.total_amount,
          status: data.status,
          project: data.project,
          invoice_id: data.invoice_id,
          notes: data.notes,
        },
      })

      return res.status(201).json({
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
        console.error('[ERROR] Error creating income:', error)
      }
      return res.status(500).json({ error: 'Error al crear ingreso' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

