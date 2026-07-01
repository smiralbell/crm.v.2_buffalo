import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import {
  launchOutboundCall,
  outboundErrorHint,
  outboundErrorMessage,
  recordFailedOutboundCall,
} from '@/lib/demos/launch-outbound-call'
import { getDemoById } from '@/lib/demos/store'

const bodySchema = z.object({
  variables: z.record(z.string()).optional(),
  numero_destino: z.string().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const parsed = bodySchema.parse(req.body)
    const demo = await getDemoById(id)
    if (!demo) return res.status(404).json({ error: 'Demo no encontrada' })

    const rawValues: Record<string, string> = { ...(parsed.variables ?? {}) }
    if (parsed.numero_destino && !rawValues.telefono) {
      rawValues.telefono = parsed.numero_destino
    }

    const result = await launchOutboundCall(demo, rawValues)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    const rawValues = (req.body?.variables ?? {}) as Record<string, string>
    const dest = req.body?.numero_destino?.trim()
    if (dest && !rawValues.telefono) rawValues.telefono = dest

    if (Number.isFinite(id)) {
      await recordFailedOutboundCall(id, rawValues, err)
    }

    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[demos/llamar POST]', err)
    return res.status(500).json({
      error: outboundErrorMessage(err),
      hint: outboundErrorHint(err),
    })
  }
}
