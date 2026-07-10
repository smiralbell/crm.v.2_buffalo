import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAdminAPI } from '@/lib/auth'
import { createCrmUser, listCrmUsers, setCrmUserActive } from '@/lib/crm-users'
import { getUserWorkStats } from '@/lib/developer/assignments'

const createSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.enum(['admin', 'developer', 'comercial']).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)

    if (req.method === 'GET') {
      const users = await listCrmUsers()
      const withStats = await Promise.all(
        users.map(async (u) => ({
          ...u,
          stats: u.role === 'developer' ? await getUserWorkStats(u.id) : null,
        }))
      )
      return res.status(200).json({ users: withStats })
    }

    if (req.method === 'POST') {
      const data = createSchema.parse(req.body)
      const user = await createCrmUser(data)
      return res.status(201).json({ user })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('crm_users') || msg.includes('does not exist')) {
      return res.status(500).json({
        error: 'Falta tabla crm_users',
        hint: 'Ejecuta prisma/CREATE_CRM_USERS.sql en PostgreSQL.',
      })
    }
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' })
    }
    if (msg === 'Forbidden' || msg === 'No session' || msg === 'Invalid session') return
    console.error('[users]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
