import type { NextApiRequest, NextApiResponse } from 'next'
import { TICKETS_WEBHOOK_TOKEN } from '@/lib/tickets/config'
import { ingestTicketPayload } from '@/lib/tickets/ingest'
import {
  deleteTicketById,
  findTicketForDelete,
  insertTicket,
  resolveProjectFromPayload,
} from '@/lib/tickets/store'

function parseAction(body: Record<string, unknown>): 'create' | 'delete' {
  const raw = typeof body.action === 'string' ? body.action.toLowerCase().trim() : ''
  if (raw === 'delete' || raw === 'eliminar' || raw === 'remove') return 'delete'
  return 'create'
}

/**
 * POST /api/webhooks/tickets
 * Webhook único para todos los proyectos.
 * Auth: Authorization: Bearer <TICKETS_WEBHOOK_TOKEN>
 *
 * action: omitido o "create" → crear incidencia
 * action: "delete" → eliminar incidencia (ticket_id o external_id + project_ref)
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
    const body = req.body
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Body JSON requerido' })
    }

    const payload = body as Record<string, unknown>
    const action = parseAction(payload)

    if (action === 'delete') {
      const project = await resolveProjectFromPayload(payload)
      const ticket = await findTicketForDelete(payload, project?.id)

      if (!ticket) {
        return res.status(404).json({
          error: 'Ticket no encontrado. Incluye ticket_id o external_id + project_ref.',
        })
      }

      if (project && ticket.project_id !== project.id) {
        return res.status(400).json({ error: 'El ticket no pertenece a ese proyecto' })
      }

      const deleted = await deleteTicketById(ticket.id)
      if (!deleted) {
        return res.status(404).json({ error: 'Ticket no encontrado' })
      }

      return res.status(200).json({
        ok: true,
        action: 'delete',
        ticket_id: ticket.id,
        external_id: ticket.external_id,
        project_id: ticket.project_id,
        message: 'Incidencia eliminada en Buffalo',
      })
    }

    const project = await resolveProjectFromPayload(payload)
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
      action: 'create',
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
