import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession } from '@/lib/auth'
import { z } from 'zod'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { handleApiError } from '@/lib/api-helpers'

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

    // Obtener credenciales del admin desde variables de entorno
    const adminEmail = process.env.CRM_ADMIN_EMAIL
    const adminPassword = process.env.CRM_ADMIN_PASSWORD

    if (!adminEmail || !adminPassword) {
      // Error crítico de configuración - siempre loguear
      console.error('[CRITICAL] CRM_ADMIN_EMAIL o CRM_ADMIN_PASSWORD no están configurados')
      return res.status(500).json({ error: 'Configuración de servidor incorrecta' })
    }

    // Verificar credenciales (usar timing-safe comparison)
    // Nota: Para mayor seguridad, usar bcrypt para comparar contraseñas
    const emailMatch = email === adminEmail
    const passwordMatch = password === adminPassword
    
    if (!emailMatch || !passwordMatch) {
      // No revelar cuál campo es incorrecto
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    // Crear sesión
    await createSession(email, res)

    return res.status(200).json({ success: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
