import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { getDemoFormularioOutbound } from '@/lib/demos/demo-detail'
import {
  formSessionCookieHeader,
  readFormSessionCookie,
  verifyFormPassword,
  verifyFormSession,
} from '@/lib/demos/form-access'
import { getDemoByPublicToken } from '@/lib/demos/public-form-store'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.query.token as string
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token inválido' })
  }

  const demo = await getDemoByPublicToken(token)
  if (!demo) return res.status(404).json({ error: 'Formulario no encontrado' })

  if (req.method === 'GET') {
    const cookie = readFormSessionCookie(req.headers.cookie)
    const demoId = verifyFormSession(cookie, token)
    const authenticated = demoId === demo.demo_id

    if (!authenticated) {
      return res.status(200).json({
        nombre_cliente: demo.nombre_cliente,
        requires_password: true,
        has_password: Boolean(demo.formulario_password_hash),
        authenticated: false,
        active: demo.estado === 'activa',
      })
    }

    const fields = await getDemoFormularioOutbound(demo.demo_id)
    return res.status(200).json({
      nombre_cliente: demo.nombre_cliente,
      requires_password: true,
      has_password: Boolean(demo.formulario_password_hash),
      authenticated: true,
      active: demo.estado === 'activa',
      fields: fields.filter((f) => f.enabled),
    })
  }

  if (req.method === 'POST') {
    const bodySchema = z.object({ password: z.string().min(1) })
    try {
      const { password } = bodySchema.parse(req.body)

      if (!demo.formulario_password_hash) {
        return res.status(400).json({
          error: 'Este formulario aún no tiene contraseña. Configúralo desde el CRM.',
        })
      }

      if (!verifyFormPassword(password, demo.formulario_password_hash)) {
        return res.status(401).json({ error: 'Contraseña incorrecta' })
      }

      res.setHeader('Set-Cookie', formSessionCookieHeader(token, demo.demo_id))
      const fields = await getDemoFormularioOutbound(demo.demo_id)
      return res.status(200).json({
        ok: true,
        nombre_cliente: demo.nombre_cliente,
        authenticated: true,
        active: demo.estado === 'activa',
        fields: fields.filter((f) => f.enabled),
      })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Contraseña requerida' })
      }
      return res.status(500).json({ error: 'Error al verificar acceso' })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
