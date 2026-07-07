import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { notifyClientTicketUpdate } from '@/lib/tickets/notify'
import { deleteTicketById } from '@/lib/tickets/store'
import {
  getTicketWithProject,
  insertTicketUpdate,
  listTicketUpdates,
  updateTicketStatus,
  type TicketUpdateRow,
} from '@/lib/tickets/updates'

const VALID_STATUS = new Set(['open', 'in_progress', 'resolved', 'closed'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let userEmail = 'Buffalo'
  try {
    const user = await requireAuthAPI(req, res)
    userEmail = user.email
  } catch {
    return
  }

  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  if (req.method === 'GET') {
    try {
      const row = await getTicketWithProject(id)
      if (!row) return res.status(404).json({ error: 'Ticket no encontrado' })

      let updates: TicketUpdateRow[] = []
      try {
        updates = await listTicketUpdates(id)
      } catch {
        updates = []
      }

      return res.status(200).json({
        ticket: {
          id: row.id,
          project_id: row.project_id,
          project_name: row.project_name,
          config_ref: row.config_ref,
          title: row.title,
          description: row.description,
          priority: row.priority,
          status: row.status,
          reporter_name: row.reporter_name,
          reporter_email: row.reporter_email,
          external_id: row.external_id,
          custom_fields: row.custom_fields,
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        },
        updates: updates.map((u) => ({
          id: u.id,
          author_name: u.author_name,
          message: u.message,
          status: u.status,
          is_from_client: u.is_from_client,
          created_at: u.created_at.toISOString(),
        })),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      if (process.env.NODE_ENV === 'development') console.error('[tickets/[id] GET]', err)
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'PATCH') {
    const { status, message } = req.body || {}

    if (status && !VALID_STATUS.has(status)) {
      return res.status(400).json({
        error: 'status inválido',
        allowed: Array.from(VALID_STATUS),
      })
    }

    const replyMessage = typeof message === 'string' ? message.trim() : ''
    if (!status && !replyMessage) {
      return res.status(400).json({ error: 'Indica status y/o message' })
    }

    try {
      const row = await getTicketWithProject(id)
      if (!row) return res.status(404).json({ error: 'Ticket no encontrado' })

      const nextStatus = status || row.status

      if (status) {
        await updateTicketStatus(id, status)
      }

      let notifyResult: { sent: boolean; error?: string } = { sent: false }

      if (replyMessage) {
        await insertTicketUpdate({
          ticketId: id,
          authorName: userEmail,
          message: replyMessage,
          status: status || null,
        })

        notifyResult = await notifyClientTicketUpdate({
          callbackUrl: row.ticket_callback_url,
          callbackToken: row.ticket_callback_token,
          payload: {
            event: 'ticket.updated',
            ticket_id: row.id,
            external_id: row.external_id,
            project_ref: row.config_ref,
            status: nextStatus,
            message: replyMessage,
            updated_by: userEmail,
            updated_at: new Date().toISOString(),
          },
        })
      } else if (status) {
        notifyResult = await notifyClientTicketUpdate({
          callbackUrl: row.ticket_callback_url,
          callbackToken: row.ticket_callback_token,
          payload: {
            event: 'ticket.updated',
            ticket_id: row.id,
            external_id: row.external_id,
            project_ref: row.config_ref,
            status: nextStatus,
            message: `Estado actualizado a ${status}`,
            updated_by: userEmail,
            updated_at: new Date().toISOString(),
          },
        })
      }

      const updates = await listTicketUpdates(id).catch(() => [])

      return res.status(200).json({
        ok: true,
        status: nextStatus,
        notify: notifyResult,
        updates: updates.map((u) => ({
          id: u.id,
          author_name: u.author_name,
          message: u.message,
          status: u.status,
          is_from_client: u.is_from_client,
          created_at: u.created_at.toISOString(),
        })),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      return res.status(500).json({ error: msg })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const row = await getTicketWithProject(id)
      if (!row) return res.status(404).json({ error: 'Ticket no encontrado' })

      const deleted = await deleteTicketById(id)
      if (!deleted) return res.status(404).json({ error: 'Ticket no encontrado' })

      const notifyResult = await notifyClientTicketUpdate({
        callbackUrl: row.ticket_callback_url,
        callbackToken: row.ticket_callback_token,
        payload: {
          event: 'ticket.deleted',
          ticket_id: row.id,
          external_id: row.external_id,
          project_ref: row.config_ref,
          deleted_by: userEmail,
          deleted_at: new Date().toISOString(),
        },
      })

      return res.status(200).json({
        ok: true,
        deleted: true,
        notify: notifyResult,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error interno'
      return res.status(500).json({ error: msg })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
