import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdminAPI } from '@/lib/auth'
import { createPortalLink, listPortalLinks, revokePortalLink } from '@/lib/portal/links'

/**
 * Enlaces del portal del cliente de un proyecto (solo admin).
 * GET    ?project_id=…                → enlaces activos
 * POST   { project_id }               → crea uno (la URL con el token solo se ve ahora)
 * DELETE { project_id, link_id }      → revoca
 */
const UUID_RE = /^[0-9a-f-]{36}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAdminAPI(req, res)
  } catch {
    return
  }
  const projectId = String(req.query.project_id || req.body?.project_id || '')
  if (!UUID_RE.test(projectId)) return res.status(400).json({ error: 'project_id inválido' })

  try {
    if (req.method === 'GET') return res.status(200).json({ links: await listPortalLinks(projectId) })
    if (req.method === 'POST') return res.status(201).json(await createPortalLink(projectId, user.email))
    if (req.method === 'DELETE') {
      const linkId = String(req.body?.link_id || '')
      if (!UUID_RE.test(linkId)) return res.status(400).json({ error: 'link_id inválido' })
      return res.status(200).json({ ok: await revokePortalLink(projectId, linkId) })
    }
    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('client_portal_links') && msg.includes('does not exist')) {
      return res.status(503).json({ error: 'Faltan migraciones: ejecuta npm run db:migrate' })
    }
    return res.status(500).json({ error: msg })
  }
}
