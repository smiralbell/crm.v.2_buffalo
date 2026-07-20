import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { isPhoneNumberConflictError } from '@/lib/demos/errors'
import { getDemoWithMetrics } from '@/lib/demos/demo-detail'
import { RetellApiError } from '@/lib/demos/retell'
import { getDemoById, parseNumerosInput, updateDemo } from '@/lib/demos/store'
import { deleteVoiceDemo, updateVoiceDemoInRetell } from '@/lib/demos/voice'

const updateSchema = z.object({
  nombre_cliente: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).optional(),
  base_conocimiento: z.string().optional(),
  frase_inicial: z.string().max(2000).optional(),
  estado: z.enum(['activa', 'pausada']).optional(),
  numeros: z.array(z.string()).optional(),
  mover_numeros: z.boolean().optional(),
  voz_id: z.string().optional(),
  direccion: z.enum(['inbound', 'outbound', 'ambos']).optional(),
  es_principal: z.boolean().optional(),
  es_asistente_crm: z.boolean().optional(),
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

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method === 'GET') {
    try {
      const detail = await getDemoWithMetrics(id)
      if (!detail) return res.status(404).json({ error: 'Demo no encontrada' })
      return res.status(200).json(detail)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      if (process.env.NODE_ENV === 'development') console.error('[demos/[id] GET]', err)
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'PUT') {
    try {
      const existing = await getDemoById(id)
      if (!existing) return res.status(404).json({ error: 'Demo no encontrada' })

      const parsed = updateSchema.parse(req.body)
      const payload: Parameters<typeof updateDemo>[1] = {}
      const options = { mover_numeros: parsed.mover_numeros }

      if (parsed.nombre_cliente !== undefined) {
        payload.nombre_cliente = parsed.nombre_cliente.trim()
      }
      if (parsed.prompt !== undefined) payload.prompt = parsed.prompt.trim()
      if (parsed.base_conocimiento !== undefined) {
        payload.base_conocimiento = parsed.base_conocimiento.trim()
      }
      if (parsed.frase_inicial !== undefined) {
        payload.frase_inicial = parsed.frase_inicial.trim()
      }
      if (parsed.estado !== undefined) payload.estado = parsed.estado
      if (parsed.numeros !== undefined) {
        payload.numeros = parseNumerosInput(parsed.numeros)
      }
      if (parsed.voz_id !== undefined) payload.voz_id = parsed.voz_id.trim()
      if (parsed.direccion !== undefined) payload.direccion = parsed.direccion
      if (parsed.es_principal !== undefined) payload.es_principal = parsed.es_principal
      if (parsed.es_asistente_crm !== undefined) {
        payload.es_asistente_crm = parsed.es_asistente_crm
      }

      const willBePrincipal =
        parsed.es_principal !== undefined ? parsed.es_principal : existing.es_principal
      const effectiveDireccion = parsed.direccion ?? existing.direccion

      if (existing.tipo === 'voz' && willBePrincipal && effectiveDireccion === 'outbound') {
        return res.status(400).json({
          error: 'La demo principal de voz debe ser inbound o ambos para recibir llamadas del widget',
        })
      }

      if (existing.tipo === 'voz') {
        await updateVoiceDemoInRetell(existing, payload)
        const demo = await updateDemo(id, payload, options)
        if (!demo) return res.status(404).json({ error: 'Demo no encontrada' })
        return res.status(200).json({ demo })
      }

      const demo = await updateDemo(id, payload, options)
      if (!demo) return res.status(404).json({ error: 'Demo no encontrada' })
      return res.status(200).json({ demo })
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
      if (process.env.NODE_ENV === 'development') console.error('[demos/[id] PUT]', err)
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const ok = await deleteVoiceDemo(id)
      if (!ok) return res.status(404).json({ error: 'Demo no encontrada' })
      return res.status(200).json({ ok: true })
    } catch (err) {
      const msg = retellErrorMessage(err)
      if (process.env.NODE_ENV === 'development') console.error('[demos/[id] DELETE]', err)
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
