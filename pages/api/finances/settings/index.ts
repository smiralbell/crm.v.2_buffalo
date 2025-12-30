import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateSettingsSchema = z.object({
  corporate_tax_percent: z.union([z.string(), z.number()]).transform((val) => parseFloat(String(val))),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuth({ req, res } as any)
  } catch (error) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  if (req.method === 'GET') {
    try {
      let settings = await prisma.financialSettings.findUnique({
        where: { id: 1 },
      })

      // Si no existe, crear con valores por defecto
      if (!settings) {
        settings = await prisma.financialSettings.create({
          data: {
            id: 1,
            corporate_tax_percent: 25,
          },
        })
      }

      return res.status(200).json({
        settings: {
          corporate_tax_percent: Number(settings.corporate_tax_percent),
        },
      })
    } catch (error: any) {
      console.error('Error fetching settings:', error)
      return res.status(500).json({ error: 'Error al obtener configuración' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const data = updateSettingsSchema.parse(req.body)

      // Intentar actualizar, si no existe crear
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

      return res.status(200).json({
        settings: {
          corporate_tax_percent: Number(settings.corporate_tax_percent),
        },
      })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      console.error('Error updating settings:', error)
      return res.status(500).json({ error: 'Error al actualizar configuración' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}

