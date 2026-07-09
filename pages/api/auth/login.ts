import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession, authenticateCredentials } from '@/lib/auth'
import { defaultHomeForRole } from '@/lib/auth-rbac'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, password } = loginSchema.parse(req.body)
    const user = await authenticateCredentials(email, password)
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }
    await createSession(user, res)
    return res.status(200).json({
      success: true,
      redirect: defaultHomeForRole(user.role),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Login error:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
