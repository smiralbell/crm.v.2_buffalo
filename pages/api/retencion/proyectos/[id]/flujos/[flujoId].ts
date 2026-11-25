import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { deleteFlujo, updateFlujo, updateFlujoWhatsapp } from '@/lib/retencion/flujos/store'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(10).max(20000).optional(),
  interval_minutes: z.union([z.literal(0), z.literal(15), z.literal(60), z.literal(360), z.literal(1440)]).optional(),
  enabled: z.boolean().optional(),
  tools: z.array(z.enum(['mcp', 'incidencias', 'tickets'])).min(1, 'Activa al menos una herramienta').optional(),
  whatsapp_enabled: z.boolean().optional(),
  whatsapp_to: z.array(z.string().max(40)).max(10, 'Máximo 10 móviles').optional(),
  whatsapp_title: z.string().max(120).nullable().optional(),
})

/** PATCH cambia nombre, prompt, disparador o pausa. DELETE borra el flujo y sus ejecuciones. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    const flujoId = String(req.query.flujoId || '')
    if (!proyectoId || !flujoId) return res.status(400).json({ error: 'ids requeridos' })
    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    if (req.method === 'PATCH') {
      const body = patchSchema.parse(req.body ?? {})
      let flujo = await updateFlujo(proyectoId, flujoId, {
        name: body.name,
        prompt: body.prompt,
        intervalMinutes: body.interval_minutes,
        enabled: body.enabled,
        tools: body.tools,
      })
      if (!flujo) return res.status(404).json({ error: 'Flujo no encontrado' })
      if (body.whatsapp_enabled !== undefined || body.whatsapp_to !== undefined || body.whatsapp_title !== undefined) {
        flujo = await updateFlujoWhatsapp(proyectoId, flujoId, {
          enabled: body.whatsapp_enabled,
          to: body.whatsapp_to,
          title: body.whatsapp_title,
        })
        if (!flujo) return res.status(404).json({ error: 'Flujo no encontrado' })
      }
      return res.status(200).json({ flujo })
    }

    if (req.method === 'DELETE') {
      const ok = await deleteFlujo(proyectoId, flujoId)
      if (!ok) return res.status(404).json({ error: 'Flujo no encontrado' })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[retencion/flujos/id]', error)
    return res.status(500).json({ error: 'Error con el flujo' })
  }
}
