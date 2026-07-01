import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { isPhoneNumberConflictError } from '@/lib/demos/errors'
import { RetellApiError } from '@/lib/demos/retell'
import { createDemo, listDemos, parseNumerosInput } from '@/lib/demos/store'
import { createVoiceDemo } from '@/lib/demos/voice'

const createSchema = z.object({
  nombre_cliente: z.string().min(1, 'Nombre requerido').max(200),
  prompt: z.string().min(1, 'Prompt requerido'),
  base_conocimiento: z.string().default(''),
  estado: z.enum(['activa', 'pausada']).default('activa'),
  numeros: z.array(z.string()).default([]),
  mover_numeros: z.boolean().optional(),
  tipo: z.enum(['whatsapp', 'voz']).default('whatsapp'),
  voz_id: z.string().optional(),
  direccion: z.enum(['inbound', 'outbound', 'ambos']).optional(),
})

function retellErrorMessage(err: unknown): string {
  if (err instanceof RetellApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Error con la API de Retell'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    try {
      const demos = await listDemos()
      return res.status(200).json({ demos })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      if (msg.includes('relation "demos" does not exist')) {
        return res.status(200).json({ demos: [] })
      }
      if (process.env.NODE_ENV === 'development') console.error('[demos/index GET]', err)
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'POST') {
    try {
      const parsed = createSchema.parse(req.body)
      const numeros = parseNumerosInput(parsed.numeros)

      if (parsed.tipo === 'voz') {
        if (!parsed.voz_id?.trim()) {
          return res.status(400).json({ error: 'El Voice ID es obligatorio para demos de voz' })
        }
        if (!parsed.direccion) {
          return res.status(400).json({ error: 'La dirección es obligatoria para demos de voz' })
        }

        const demo = await createVoiceDemo(
          {
            nombre_cliente: parsed.nombre_cliente.trim(),
            prompt: parsed.prompt.trim(),
            base_conocimiento: parsed.base_conocimiento.trim(),
            estado: parsed.estado,
            numeros,
            tipo: 'voz',
            voz_id: parsed.voz_id.trim(),
            direccion: parsed.direccion,
          },
          { mover_numeros: parsed.mover_numeros }
        )
        return res.status(201).json({ demo })
      }

      const demo = await createDemo(
        {
          nombre_cliente: parsed.nombre_cliente.trim(),
          prompt: parsed.prompt.trim(),
          base_conocimiento: parsed.base_conocimiento.trim(),
          estado: parsed.estado,
          numeros,
          tipo: 'whatsapp',
        },
        { mover_numeros: parsed.mover_numeros }
      )
      return res.status(201).json({ demo })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
      }
      if (isPhoneNumberConflictError(err)) {
        return res.status(409).json({
          error: 'phone_conflict',
          message: err.message,
          conflicts: err.conflicts,
        })
      }
      const msg = retellErrorMessage(err)
      if (process.env.NODE_ENV === 'development') console.error('[demos/index POST]', err)
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
