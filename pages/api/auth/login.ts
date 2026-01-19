import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession, type AuthUser } from '@/lib/auth'
import { z } from 'zod'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { handleApiError } from '@/lib/api-helpers'
import { getPrismaClient } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const loginSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  password: z.string().min(1, 'La contraseña es requerida').max(255),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Rate limiting: 5 intentos por 15 minutos
    const ip = getClientIP(req)
    const rateLimit = checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000)
    
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Demasiados intentos de inicio de sesión. Por favor, intenta más tarde.',
        retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
      })
    }

    const { email, password } = loginSchema.parse(req.body)

    const prisma = getPrismaClient()

    // Buscar usuario por email
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash)

    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'user',
    }

    // Crear sesión
    await createSession(authUser, res)

    return res.status(200).json({ success: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
