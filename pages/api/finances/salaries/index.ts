import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createSalarySchema = z.object({
  person_name: z.string().min(1, 'El nombre es requerido'),
  date: z.string(),
  amount: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))),
  notes: z.string().optional().nullable(),
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
      const month = req.query.month as string
      let where: any = { deleted_at: null }

      if (month) {
        const year = parseInt(month.split('-')[0])
        const monthNum = parseInt(month.split('-')[1])
        const startDate = new Date(year, monthNum - 1, 1)
        const endDate = new Date(year, monthNum, 0)
        where.date = { gte: startDate, lte: endDate }
      }

      const salaries = await prisma.salary.findMany({
        where,
        orderBy: { date: 'desc' },
      })

      return res.status(200).json({
        salaries: salaries.map((s) => ({
          ...s,
          amount: Number(s.amount),
          date: s.date.toISOString(),
        })),
      })
    } catch (error: any) {
      console.error('Error fetching salaries:', error)
      return res.status(500).json({ error: 'Error al obtener nóminas' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createSalarySchema.parse(req.body)

      const salary = await prisma.salary.create({
        data: {
          person_name: data.person_name,
          date: new Date(data.date),
          amount: data.amount,
          notes: data.notes,
          tags: data.tags || [],
        },
      })

      return res.status(201).json({
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
      console.error('Error creating salary:', error)
      return res.status(500).json({ error: 'Error al crear nómina' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

