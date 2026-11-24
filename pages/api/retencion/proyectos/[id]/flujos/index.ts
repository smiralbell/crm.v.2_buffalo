import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { FLUJO_INTERVALOS, createFlujo, listFlujos } from '@/lib/retencion/flujos/store'

const createSchema = z.object({
  name: z.string().trim().min(1, 'Pon un nombre al flujo').max(120),
  prompt: z.string().trim().min(10, 'El prompt es demasiado corto').max(20000),
  interval_minutes: z.union([z.literal(0), z.literal(15), z.literal(60), z.literal(360), z.literal(1440)]).default(0),
  enabled: z.boolean().default(true),
})

/** Flujos de Retención del proyecto. GET lista, POST crea. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })
    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    if (req.method === 'GET') {
      const flujos = await listFlujos(proyectoId)
      return res.status(200).json({ flujos, intervalos: FLUJO_INTERVALOS })
    }

    if (req.method === 'POST') {
      const body = createSchema.parse(req.body ?? {})
      const flujo = await createFlujo({
        proyectoId,
        name: body.name,
        prompt: body.prompt,
        intervalMinutes: body.interval_minutes,
        enabled: body.enabled,
      })
      return res.status(201).json({ flujo })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[retencion/flujos]', error)
    return res.status(500).json({ error: 'Error con los flujos' })
  }
}
