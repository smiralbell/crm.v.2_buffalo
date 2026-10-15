import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  ensureAnnualTargetColumn,
  getAnnualRevenueTarget,
  setAnnualRevenueTarget,
} from '@/lib/finance/annual-target'

const updateSettingsSchema = z.object({
  corporate_tax_percent: z
    .union([z.string(), z.number()])
    .transform((val) => parseFloat(String(val)))
    .optional(),
  annual_revenue_target: z
    .union([z.string(), z.number()])
    .transform((val) => parseFloat(String(val)))
    .optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuth({ req, res } as any)
  } catch (error) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  if (req.method === 'GET') {
    try {
      await ensureAnnualTargetColumn()
      let settings = await prisma.financialSettings.findUnique({
        where: { id: 1 },
      })

      if (!settings) {
        settings = await prisma.financialSettings.create({
          data: {
            id: 1,
            corporate_tax_percent: 25,
          },
        })
      }

      const annual_revenue_target = await getAnnualRevenueTarget()

      return res.status(200).json({
        settings: {
          corporate_tax_percent: Number(settings.corporate_tax_percent),
          annual_revenue_target,
        },
      })
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error fetching settings:', error)
      }
      return res.status(500).json({ error: 'Error al obtener configuración' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const data = updateSettingsSchema.parse(req.body)
      if (data.corporate_tax_percent == null && data.annual_revenue_target == null) {
        return res.status(400).json({ error: 'Nada que actualizar' })
      }

      let annual_revenue_target = await getAnnualRevenueTarget()
      if (data.annual_revenue_target != null) {
        annual_revenue_target = await setAnnualRevenueTarget(data.annual_revenue_target)
      }

      let corporate_tax_percent = 25
      if (data.corporate_tax_percent != null) {
        let settings = await prisma.financialSettings.findUnique({
          where: { id: 1 },
        })

        if (settings) {
          settings = await prisma.financialSettings.update({
            where: { id: 1 },
            data: {
              corporate_tax_percent: data.corporate_tax_percent,
            },
          })
        } else {
          settings = await prisma.financialSettings.create({
            data: {
              id: 1,
              corporate_tax_percent: data.corporate_tax_percent,
            },
          })
        }
        corporate_tax_percent = Number(settings.corporate_tax_percent)
      } else {
        const settings = await prisma.financialSettings.findUnique({ where: { id: 1 } })
        corporate_tax_percent = settings ? Number(settings.corporate_tax_percent) : 25
      }

      return res.status(200).json({
        settings: {
          corporate_tax_percent,
          annual_revenue_target,
        },
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      if (error instanceof Error && error.message.includes('objetivo anual')) {
        return res.status(400).json({ error: error.message })
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('[ERROR] Error updating settings:', error)
      }
      return res.status(500).json({ error: 'Error al actualizar configuración' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
