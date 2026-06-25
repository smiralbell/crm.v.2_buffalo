import type { NextApiRequest, NextApiResponse } from 'next'
import { TICKETS_WEBHOOK_TOKEN } from '@/lib/tickets/config'
import { ensureTicketTables } from '@/lib/tickets/ensure-tables'
import { ingestTicketPayload } from '@/lib/tickets/ingest'
import { insertTicket, resolveProjectFromPayload } from '@/lib/tickets/store'

/**
 * POST /api/webhooks/tickets
 * Webhook único para todos los proyectos.
 * Auth: Authorization: Bearer <TICKETS_WEBHOOK_TOKEN>
 * Proyecto: project_id o project_ref en el body JSON
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token || token !== TICKETS_WEBHOOK_TOKEN) {
    return res.status(401).json({
      error: 'Authorization inválida. Usa: Bearer <TICKETS_WEBHOOK_TOKEN>',
    })
  }

  try {
    await ensureTicketTables()

    const body = req.body
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Body JSON requerido' })
    }

    const project = await resolveProjectFromPayload(body as Record<string, unknown>)
    if (!project) {
      return res.status(400).json({
        error: 'Proyecto no encontrado. Incluye project_id o project_ref en el body.',
      })
    }

    const ticket = ingestTicketPayload(body)

    if (!ticket.title) {
      return res.status(400).json({ error: 'Se requiere al menos title o description' })
    }

    const result = await insertTicket(project.id, ticket)

    return res.status(result.duplicate ? 200 : 201).json({
      ok: true,
      ticket_id: result.id,
      project_id: project.id,
      project_name: project.name,
      duplicate: result.duplicate,
      message: result.duplicate
        ? 'Ticket ya existía (mismo external_id)'
        : 'Incidencia recibida correctamente',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (process.env.NODE_ENV === 'development') console.error('[webhooks/tickets]', err)
    return res.status(500).json({ error: msg })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}
