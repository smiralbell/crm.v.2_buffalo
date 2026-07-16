import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { analyzeCustomProjectBrief } from '@/lib/onboarding/custom-brief-ai'

const schema = z.object({
  brief: z.string().min(10, 'Escribe un brief un poco más completo'),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
  client: z
    .object({
      nombre: z.string().optional(),
      empresa: z.string().optional(),
      email: z.string().optional(),
      ciudad: z.string().optional(),
      ref: z.string().optional(),
    })
    .optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = schema.parse(req.body)
    const result = await analyzeCustomProjectBrief(body)
    return res.status(200).json(result)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[onboarding/custom-brief]', err)
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('OPENROUTER_API_KEY')) {
      return res.status(503).json({ error: 'IA no configurada (OPENROUTER_API_KEY)' })
    }
    return res.status(500).json({ error: msg })
  }
}
