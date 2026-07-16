import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAdminAPI } from '@/lib/auth'
import {
  CrmUserEmailTakenError,
  findCrmUserById,
  setCrmUserActive,
  updateCrmUserPassword,
  updateCrmUserProfile,
} from '@/lib/crm-users'

const patchSchema = z
  .object({
    active: z.boolean().optional(),
    password: z.string().min(8, 'Mínimo 8 caracteres').optional(),
    name: z.string().min(1, 'Nombre obligatorio').optional(),
    email: z.string().email('Email inválido').optional(),
  })
  .refine(
    (d) =>
      d.active !== undefined ||
      d.password !== undefined ||
      d.name !== undefined ||
      d.email !== undefined,
    { message: 'Indica active, password, name o email' }
  )

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminAPI(req, res)
    const id = parseInt(String(req.query.id), 10)
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

    if (req.method === 'PATCH') {
      const data = patchSchema.parse(req.body)
      const existing = await findCrmUserById(id)
      if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' })

      if (data.password) {
        const user = await updateCrmUserPassword(id, data.password)
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
        return res.status(200).json({ user, password: data.password })
      }

      if (data.name !== undefined || data.email !== undefined) {
        try {
          const user = await updateCrmUserProfile(id, {
            name: data.name,
            email: data.email,
          })
          if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
          return res.status(200).json({ user })
        } catch (err) {
          if (err instanceof CrmUserEmailTakenError) {
            return res.status(409).json({ error: 'Ese correo ya está en uso' })
          }
          if (err instanceof Error && err.message === 'NAME_REQUIRED') {
            return res.status(400).json({ error: 'Nombre obligatorio' })
          }
          if (err instanceof Error && err.message === 'EMAIL_REQUIRED') {
            return res.status(400).json({ error: 'Email obligatorio' })
          }
          throw err
        }
      }

      if (data.active !== undefined) {
        const user = await setCrmUserActive(id, data.active)
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
        return res.status(200).json({ user })
      }

      return res.status(400).json({ error: 'Sin cambios' })
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
