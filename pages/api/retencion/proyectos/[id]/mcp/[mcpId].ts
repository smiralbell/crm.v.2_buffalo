import type { NextApiRequest, NextApiResponse } from 'next'
import { z, ZodError } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { verifyAndStore } from '@/lib/retencion/mcp/api'
import { startOAuth } from '@/lib/retencion/mcp/oauth'
import { deleteMcpServer, getMcpServer, patchMcpServer, toPublic } from '@/lib/retencion/mcp/store'

const actionSchema = z.object({ accion: z.enum(['comprobar', 'conectar', 'desconectar']) })
const patchSchema = z.object({ disabled_tools: z.array(z.string().max(200)).max(500) })

/**
 * POST {accion}: comprobar · conectar (iniciar sesión) · desconectar (cerrar sesión)
 * PATCH: herramientas permitidas · DELETE: quitar el conector.
 */
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
    if (!row) return res.status(404).json({ error: 'Conector no encontrado' })

    if (req.method === 'POST') {
      const { accion } = actionSchema.parse(req.body || {})
      if (accion === 'comprobar') return res.status(200).json({ server: await verifyAndStore(row) })
      if (user.role !== 'admin') return res.status(403).json({ error: 'Solo un admin puede cambiar los conectores' })
      if (accion === 'desconectar') {
        const updated = await patchMcpServer(row.id, { oauth_tokens: null, oauth_verifier: null, estado: 'pendiente', detalle: null })
        return res.status(200).json({ server: updated ? toPublic(updated) : null })
      }
      if (row.auth_mode !== 'oauth') return res.status(200).json({ server: await verifyAndStore(row) })
      const { authorizeUrl } = await startOAuth(row)
      if (!authorizeUrl) return res.status(200).json({ server: await verifyAndStore(row) })
      return res.status(200).json({ authorize_url: authorizeUrl })
    }

    if (user.role !== 'admin') return res.status(403).json({ error: 'Solo un admin puede cambiar los conectores' })

    if (req.method === 'PATCH') {
      const { disabled_tools } = patchSchema.parse(req.body || {})
      const updated = await patchMcpServer(row.id, { disabled_tools })
      return res.status(200).json({ server: updated ? toPublic(updated) : null })
    }

    if (req.method === 'DELETE') {
      await deleteMcpServer(mcpId, proyectoId)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'POST, PATCH, DELETE')
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (res.headersSent) return
    if (e instanceof ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Datos no válidos' })
    console.error('[retencion/mcp]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' })
  }
}
