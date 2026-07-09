import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAdminAPI } from '@/lib/auth'
import { setCrmUserActive } from '@/lib/crm-users'

const patchSchema = z.object({
  active: z.boolean(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
    const id = parseInt(String(req.query.id), 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

    if (req.method === 'PATCH') {
      const data = patchSchema.parse(req.body)
      const user = await setCrmUserActive(id, data.active)
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
      return res.status(200).json({ user })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[users/[id]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
