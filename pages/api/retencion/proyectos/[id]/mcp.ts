import type { NextApiRequest, NextApiResponse } from 'next'
import { ZodError } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { mcpInputSchema, verifyNew } from '@/lib/retencion/mcp/api'
import { insertMcpServer, listMcpServers, toPublic } from '@/lib/retencion/mcp/store'

/** GET: MCP del proyecto · POST: conectar uno nuevo (solo si es de solo lectura). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    if (!proyectoId) return res.status(400).json({ error: 'id requerido' })

    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    if (req.method === 'GET') {
      const rows = await listMcpServers(proyectoId)
      return res.status(200).json({ servers: rows.map(toPublic) })
    }

    if (req.method === 'POST') {
      if (user.role !== 'admin') return res.status(403).json({ error: 'Solo un admin puede conectar MCP' })
      const input = mcpInputSchema.parse(req.body || {})
      const outcome = await verifyNew(input, null)
      if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error, bloqueadas: outcome.bloqueadas })
      const row = await insertMcpServer(proyectoId, input, outcome.verified)
      return res.status(201).json({ server: toPublic(row) })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (res.headersSent) return
    if (e instanceof ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Datos no válidos' })
    console.error('[retencion/mcp]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' })
  }
}
