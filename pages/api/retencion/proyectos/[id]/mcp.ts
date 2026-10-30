import type { NextApiRequest, NextApiResponse } from 'next'
import { ZodError } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { assertProjectAccess } from '@/lib/project-access'
import { assertRetencionEligible } from '@/lib/retencion/eligibility'
import { createSchema } from '@/lib/retencion/mcp/api'
import { inspectMcp } from '@/lib/retencion/mcp/client'
import { startOAuth } from '@/lib/retencion/mcp/oauth'
import { describeBlocked } from '@/lib/retencion/mcp/readonly'
import { headersToRecord, insertMcpServer, listMcpServers, toPublic } from '@/lib/retencion/mcp/store'

/** GET: conectores MCP del proyecto · POST: añadir uno (como «Add custom connector» de Claude). */
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
      if (user.role !== 'admin') return res.status(403).json({ error: 'Solo un admin puede añadir conectores' })
      const input = createSchema.parse(req.body || {})
      const base = {
        nombre: input.nombre,
        url: input.url,
        transport: input.transport,
        oauth_client: input.oauth_client,
        client_id: input.client_id,
        client_secret: input.client_secret,
        headers: input.headers,
      }

      if (input.sign_in === 'none') {
        // Sin inicio de sesión: se comprueba ya y solo se guarda si es de solo lectura.
        let inspected
        try {
          inspected = await inspectMcp({ url: input.url, transport: input.transport, headers: headersToRecord(input.headers) })
        } catch (e) {
          return res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
        }
        if (!inspected.check.ok) {
          return res.status(400).json({ error: describeBlocked(inspected.check), bloqueadas: inspected.check.bloqueadas })
        }
        const row = await insertMcpServer(proyectoId, { ...base, auth_mode: 'none' }, {
          estado: 'conectado',
          verified: { serverName: inspected.serverName, tools: inspected.tools, transport: inspected.transport },
        })
        return res.status(201).json({ server: toPublic(row) })
      }

      const row = await insertMcpServer(proyectoId, { ...base, auth_mode: 'oauth' }, {
        estado: 'pendiente',
        auth_server: typeof req.body?.auth_server === 'string' ? req.body.auth_server.slice(0, 200) : null,
      })
      if (input.sign_in === 'later') return res.status(201).json({ server: toPublic(row) })
      try {
        const { authorizeUrl } = await startOAuth(row)
        return res.status(201).json({ server: toPublic(row), authorize_url: authorizeUrl })
      } catch (e) {
        return res.status(201).json({
          server: toPublic(row),
          error_login: `Conector añadido, pero no se pudo empezar el inicio de sesión: ${e instanceof Error ? e.message : String(e)}`,
        })
      }
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
