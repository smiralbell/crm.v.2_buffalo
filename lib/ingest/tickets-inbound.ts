import { createHash } from 'crypto'
import type { InboundProcessorResult } from '@/lib/ingest/types'
import { ingestTicketPayload } from '@/lib/tickets/ingest'
import { alertTeamOfNewTicket } from '@/lib/tickets/team-alerts'
import {
  deleteTicketById,
  findTicketForDelete,
  insertTicket,
  resolveProjectFromPayload,
} from '@/lib/tickets/store'

export function parseTicketsAction(body: Record<string, unknown>): 'create' | 'delete' {
  const raw = typeof body.action === 'string' ? body.action.toLowerCase().trim() : ''
  if (raw === 'delete' || raw === 'eliminar' || raw === 'remove') return 'delete'
  return 'create'
}

export function ticketsExternalId(payload: unknown): string {
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {}
  const action = parseTicketsAction(body)
  const ticket = ingestTicketPayload(body)
  if (action === 'delete') {
    const id = ticket.external_id || (typeof body.ticket_id === 'string' ? body.ticket_id : null)
    return `tix:del:${id || createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)}`
  }
  return `tix:${ticket.external_id || createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}`
}

export async function processTickets(payload: unknown): Promise<InboundProcessorResult> {
  if (!payload || typeof payload !== 'object') return { status: 'ignored', result: { reason: 'empty' } }
  const body = payload as Record<string, unknown>
  const action = parseTicketsAction(body)

  if (action === 'delete') {
    const project = await resolveProjectFromPayload(body)
    const ticket = await findTicketForDelete(body, project?.id)
    if (!ticket) return { status: 'ignored', result: { reason: 'ticket_not_found' } }
    if (project && ticket.project_id !== project.id) {
      return { status: 'ignored', result: { reason: 'project_mismatch' } }
    }
    const deleted = await deleteTicketById(ticket.id)
    if (!deleted) return { status: 'ignored', result: { reason: 'ticket_not_found' } }
    return {
      status: 'processed',
      result: { action: 'delete', ticket_id: ticket.id, external_id: ticket.external_id, project_id: ticket.project_id },
    }
  }

  const project = await resolveProjectFromPayload(body)
  if (!project) return { status: 'ignored', result: { reason: 'project_not_found' } }
  const ticket = ingestTicketPayload(body)
  if (!ticket.title) return { status: 'ignored', result: { reason: 'missing_title' } }
  const result = await insertTicket(project.id, ticket)
  if (!result.duplicate) {
    void alertTeamOfNewTicket({
      ticketId: result.id,
      projectId: project.id,
      projectName: project.name,
      title: ticket.title,
      priority: ticket.priority,
    })
  }
  return {
    status: 'processed',
    result: {
      action: 'create',
      ticket_id: result.id,
      project_id: project.id,
      duplicate: result.duplicate,
    },
  }
}
