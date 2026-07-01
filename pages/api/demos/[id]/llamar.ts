import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { RetellApiError, retellCreatePhoneCall, retellPhoneNumber } from '@/lib/demos/retell'
import { getDemoById } from '@/lib/demos/store'

const bodySchema = z.object({
  numero_destino: z.string().min(1, 'Número de destino requerido'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  try {
    const { numero_destino } = bodySchema.parse(req.body)
    const demo = await getDemoById(id)

    if (!demo) return res.status(404).json({ error: 'Demo no encontrada' })
    if (demo.tipo !== 'voz') {
      return res.status(400).json({ error: 'Solo las demos de voz pueden lanzar llamadas' })
    }
    if (demo.estado !== 'activa') {
      return res.status(400).json({ error: 'La demo debe estar activa para llamar' })
    }
    if (!demo.direccion || !['outbound', 'ambos'].includes(demo.direccion)) {
      return res.status(400).json({ error: 'Esta demo no está configurada para llamadas salientes' })
    }
    if (!demo.retell_agent_id) {
      return res.status(400).json({ error: 'La demo no tiene agente Retell configurado' })
    }

    const destino = numero_destino.trim()
    if (!demo.numeros.includes(destino)) {
      return res.status(400).json({
        error: 'El número de destino no está autorizado en esta demo',
      })
    }

    const result = await retellCreatePhoneCall({
      from_number: retellPhoneNumber(),
      to_number: destino,
      override_agent_id: demo.retell_agent_id,
    })

    return res.status(200).json({
      ok: true,
      call: result,
      numero_destino: destino,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
    }
    const msg =
      err instanceof RetellApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Error al iniciar la llamada'
    if (process.env.NODE_ENV === 'development') console.error('[demos/llamar POST]', err)
    return res.status(500).json({ error: msg })
  }
}
