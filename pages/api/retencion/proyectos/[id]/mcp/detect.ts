import type { NextApiRequest, NextApiResponse } from 'next'
import { ZodError } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { detectSchema } from '@/lib/retencion/mcp/api'
import { detectAuth } from '@/lib/retencion/mcp/oauth'

/** Paso 1 del asistente: qué autenticación pide el servidor MCP. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    await assertProjectAccess(user, proyectoId, res)
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Método no permitido' })
    }
    if (user.role !== 'admin') return res.status(403).json({ error: 'Solo un admin puede añadir conectores' })
    const { url } = detectSchema.parse(req.body || {})
    return res.status(200).json({ deteccion: await detectAuth(url) })
  } catch (e) {
    if (res.headersSent) return
    if (e instanceof ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Datos no válidos' })
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' })
  }
}
