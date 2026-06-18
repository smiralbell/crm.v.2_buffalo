import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { syncProyectoFromLead } from '@/lib/engranaje5/sync-proyecto'
import { z } from 'zod'

const bodySchema = z.object({
  leadId: z.number().int().positive(),
  configuracion: z.string().optional().nullable(),
  setupFee: z.number().optional().nullable(),
  monthlyFee: z.number().optional().nullable(),
  leadEstado: z.string().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await requireAuthAPI(req, res)
    const body = bodySchema.parse(req.body)
    const result = await syncProyectoFromLead(body)

    if (result.skipped) {
      return res.status(200).json({ ok: true, skipped: true, reason: result.reason })
    }

    return res.status(200).json({
      ok: true,
      proyecto: {
        id: result.proyecto.id,
        name: result.proyecto.name,
        service_type: result.proyecto.service_type,
        status: result.proyecto.status,
        setup_fee_eur: result.proyecto.setup_fee_eur,
        monthly_fee_eur: result.proyecto.monthly_fee_eur,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    const msg = error instanceof Error ? error.message : 'Error al sincronizar proyecto'
    if (msg.includes('proyectos') || msg.includes('does not exist')) {
      return res.status(503).json({
        error: 'Tablas de Engranaje 5 no encontradas en PostgreSQL.',
        hint: 'Ejecuta el SQL de engranaje5 y prisma/CREATE_ENGRANAJE5_CRM_BRIDGE.sql, luego npm run prisma:generate',
      })
    }
    console.error('[engranaje5/sync]', error)
    return res.status(500).json({ error: msg })
  }
}
