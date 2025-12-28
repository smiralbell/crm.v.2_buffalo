import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession } from '@/lib/auth'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, password } = loginSchema.parse(req.body)

    // Obtener credenciales del admin desde variables de entorno
    const adminEmail = process.env.CRM_ADMIN_EMAIL
    const adminPassword = process.env.CRM_ADMIN_PASSWORD

    if (!adminEmail || !adminPassword) {
      console.error('CRM_ADMIN_EMAIL o CRM_ADMIN_PASSWORD no están configurados')
      return res.status(500).json({ error: 'Configuración de servidor incorrecta' })
    }

    // Verificar credenciales
    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    // Crear sesión
    await createSession(email, res)

    return res.status(200).json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }

    console.error('Login error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
