import type { NextApiRequest, NextApiResponse } from 'next'
import { acceptInbound } from '@/lib/ingest/events'
import { bearerMatches } from '@/lib/ingest/auth'
import { parseTicketsAction, ticketsExternalId } from '@/lib/ingest/tickets-inbound'
import { ticketsWebhookToken } from '@/lib/tickets/config'
import { ingestTicketPayload } from '@/lib/tickets/ingest'
import { findTicketForDelete, resolveProjectFromPayload } from '@/lib/tickets/store'

/**
 * POST /api/webhooks/tickets
 * Auth: Authorization: Bearer <TICKETS_WEBHOOK_TOKEN>
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!bearerMatches(req, ticketsWebhookToken())) {
    return res.status(401).json({ error: 'Authorization inválida. Usa: Bearer <TICKETS_WEBHOOK_TOKEN>' })
  }

  try {
    const body = req.body
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body JSON requerido' })
    const payload = body as Record<string, unknown>
    const action = parseTicketsAction(payload)

    if (action === 'delete') {
      const project = await resolveProjectFromPayload(payload)
      const ticket = await findTicketForDelete(payload, project?.id)
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket no encontrado. Incluye ticket_id o external_id + project_ref.' })
      }
      if (project && ticket.project_id !== project.id) {
        return res.status(400).json({ error: 'El ticket no pertenece a ese proyecto' })
      }
    } else {
      const project = await resolveProjectFromPayload(payload)
      if (!project) {
        return res.status(400).json({ error: 'Proyecto no encontrado. Incluye project_id o project_ref en el body.' })
      }
      const ticket = ingestTicketPayload(body)
      if (!ticket.title) return res.status(400).json({ error: 'Se requiere al menos title o description' })
    }

    const out = await acceptInbound({
      source: 'tickets',
      externalId: ticketsExternalId(payload),
      eventType: action,
      payload,
    })
    const status = action === 'create' && !out.duplicate && out.status === 'processed' ? 201 : 200
    return res.status(status).json({
      ok: true,
      ...out.result,
      event_id: out.event_id,
      duplicate: out.duplicate,
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
