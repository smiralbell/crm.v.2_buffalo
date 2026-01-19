import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getPrismaClient } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-helpers'
import { createSession, type AuthUser } from '@/lib/auth'

const prisma = getPrismaClient()

const registerSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  password: z.string().min(6, 'Mínimo 6 caracteres').max(255),
  name: z.string().max(255).optional(),
  role: z.enum(['admin', 'user']).default('user'),
  adminKey: z.string().optional(),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, password, name, role, adminKey } = registerSchema.parse(req.body)

    // Si quiere registrarse como admin, debe aportar la clave correcta
    if (role === 'admin') {
      const configuredKey = process.env.ADMIN_REGISTRATION_KEY
      if (!configuredKey) {
        console.error('[CRITICAL] Falta ADMIN_REGISTRATION_KEY en .env')
        return res.status(500).json({ error: 'Configuración de servidor incorrecta' })
      }

      if (adminKey !== configuredKey) {
        return res.status(403).json({ error: 'Clave de administrador inválida' })
      }
    }

    // Comprobar si ya existe un usuario con ese email
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const created = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password_hash: passwordHash,
        role,
      },
    })

    const authUser: AuthUser = {
      id: created.id,
      email: created.email,
      role: created.role === 'admin' ? 'admin' : 'user',
    }

    // Opcional: iniciar sesión automáticamente tras registro
    await createSession(authUser, res)

    return res.status(201).json({ success: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}


