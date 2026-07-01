import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { findPhoneConflicts, parseNumerosInput } from '@/lib/demos/store'

const schema = z.object({
  numeros: z.array(z.string()).default([]),
  except_demo_id: z.number().int().positive().optional(),
  tipo: z.enum(['whatsapp', 'voz']).default('whatsapp'),
})

/** POST /api/demos/check-phones — comprueba conflictos sin guardar */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const parsed = schema.parse(req.body)
    const numeros = parseNumerosInput(parsed.numeros)
    const conflicts = await findPhoneConflicts(numeros, parsed.except_demo_id, parsed.tipo)
    return res.status(200).json({ conflicts, has_conflicts: conflicts.length > 0 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
    }
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('relation "demo_numeros" does not exist')) {
      return res.status(200).json({ conflicts: [], has_conflicts: false })
    }
    if (process.env.NODE_ENV === 'development') console.error('[demos/check-phones]', err)
    return res.status(500).json({ error: msg })
  }
}
