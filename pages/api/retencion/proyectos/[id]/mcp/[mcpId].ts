import type { NextApiRequest, NextApiResponse } from 'next'
import { ZodError } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { decryptDbUrl } from '@/lib/retencion/db-url-crypto'
import { mcpInputSchema, recheck, verifyNew } from '@/lib/retencion/mcp/api'
import { deleteMcpServer, getMcpServer, toPublic, updateMcpServer } from '@/lib/retencion/mcp/store'

/** POST: volver a comprobar · PUT: editar (se vuelve a verificar) · DELETE: desconectar. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    const proyectoId = String(req.query.id || '')
    const mcpId = Number(req.query.mcpId)
    if (!proyectoId || !Number.isInteger(mcpId)) return res.status(400).json({ error: 'id requerido' })

    await assertProjectAccess(user, proyectoId, res)
    const eligible = await assertRetencionEligible(proyectoId)
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error })

    const row = await getMcpServer(mcpId, proyectoId)
    if (!row) return res.status(404).json({ error: 'MCP no encontrado' })

    if (req.method === 'POST') {
      return res.status(200).json({ server: await recheck(row) })
    }

    if (req.method !== 'POST' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo un admin puede cambiar los MCP' })
    }

    if (req.method === 'PUT') {
      const input = mcpInputSchema.parse(req.body || {})
      const saved = row.auth_secret_enc ? decryptDbUrl(row.auth_secret_enc) : null
      const outcome = await verifyNew(input, saved)
      if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error, bloqueadas: outcome.bloqueadas })
      const updated = await updateMcpServer(mcpId, input, outcome.verified)
      return res.status(200).json({ server: toPublic(updated) })
    }

    if (req.method === 'DELETE') {
      await deleteMcpServer(mcpId, proyectoId)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'POST, PUT, DELETE')
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (res.headersSent) return
    if (e instanceof ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Datos no válidos' })
    console.error('[retencion/mcp]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' })
  }
}
