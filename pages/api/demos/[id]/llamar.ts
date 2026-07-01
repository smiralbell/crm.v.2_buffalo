import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { matchAuthorizedDemoPhone } from '@/lib/demos/phone-match'
import {
  RetellApiError,
  retellCreatePhoneCall,
  retellResolveFromNumber,
} from '@/lib/demos/retell'
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

    const destinoAutorizado = matchAuthorizedDemoPhone(demo.numeros, numero_destino)
    if (!destinoAutorizado) {
      return res.status(400).json({
        error: `El número ${numero_destino.trim()} no está autorizado en esta demo`,
        numeros_autorizados: demo.numeros,
      })
    }

    const fromNumber = await retellResolveFromNumber(id)

    const result = await retellCreatePhoneCall({
      from_number: fromNumber,
      to_number: destinoAutorizado,
      override_agent_id: demo.retell_agent_id,
      demo_id: id,
    })

    return res.status(200).json({
      ok: true,
      call: result,
      call_id: result?.call_id ?? null,
      call_status: result?.call_status ?? null,
      from_number: fromNumber,
      numero_destino: destinoAutorizado,
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
    console.error('[demos/llamar POST]', err)
    return res.status(500).json({
      error: msg,
      hint:
        err instanceof RetellApiError && err.status === 422
          ? 'Comprueba que RETELL_PHONE_NUMBER coincide con un número de tu cuenta Retell y que el destino está en formato +34XXXXXXXXX'
          : undefined,
    })
  }
}
