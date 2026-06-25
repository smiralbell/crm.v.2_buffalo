import { prisma } from '@/lib/prisma'

export interface TicketUpdateRow {
  id: string
  ticket_id: string
  author_name: string | null
  message: string
  status: string | null
  is_from_client: boolean
  created_at: Date
}

export async function listTicketUpdates(ticketId: string): Promise<TicketUpdateRow[]> {
  return prisma.$queryRaw<TicketUpdateRow[]>`
    SELECT id, ticket_id, author_name, message, status, is_from_client, created_at
    FROM ticket_updates
    WHERE ticket_id = ${ticketId}::uuid
    ORDER BY created_at ASC
  `
}

export async function insertTicketUpdate(params: {
  ticketId: string
  authorName: string | null
  message: string
  status?: string | null
  isFromClient?: boolean
}): Promise<string> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO ticket_updates (ticket_id, author_name, message, status, is_from_client)
    VALUES (
      ${params.ticketId}::uuid,
      ${params.authorName},
      ${params.message},
      ${params.status ?? null},
      ${params.isFromClient ?? false}
    )
    RETURNING id
  `
  const id = rows[0]?.id
  if (!id) throw new Error('No se pudo guardar la respuesta')
  return id
}

export async function getTicketWithProject(ticketId: string) {
  const rows = await prisma.$queryRaw<
    {
      id: string
      project_id: string
      project_name: string
      config_ref: string | null
      ticket_callback_url: string | null
      ticket_callback_token: string | null
      title: string
      description: string | null
      priority: string
      status: string
      reporter_name: string | null
      reporter_email: string | null
      external_id: string | null
      custom_fields: unknown
      created_at: Date
      updated_at: Date
    }[]
  >`
    SELECT
      t.id, t.project_id, p.name AS project_name, p.config_ref,
      p.ticket_callback_url, p.ticket_callback_token,
      t.title, t.description, t.priority, t.status,
      t.reporter_name, t.reporter_email, t.external_id,
      t.custom_fields, t.created_at, t.updated_at
    FROM tickets t
    JOIN proyectos p ON p.id = t.project_id
    WHERE t.id = ${ticketId}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function updateTicketStatus(ticketId: string, status: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE tickets SET status = ${status}, updated_at = NOW()
    WHERE id = ${ticketId}::uuid
  `
}

export async function listProjectTicketConfigs() {
  return prisma.$queryRaw<
    {
      id: string
      name: string
      config_ref: string | null
      ticket_callback_url: string | null
      ticket_callback_token: string | null
      ticket_count: bigint
    }[]
  >`
    SELECT
      p.id, p.name, p.config_ref,
      p.ticket_callback_url, p.ticket_callback_token,
      COUNT(t.id)::bigint AS ticket_count
    FROM proyectos p
    LEFT JOIN tickets t ON t.project_id = p.id
    GROUP BY p.id, p.name, p.config_ref, p.ticket_callback_url, p.ticket_callback_token
    ORDER BY p.name
  `
}

export async function saveProjectTicketConfig(params: {
  projectId: string
  callbackUrl: string | null
  callbackToken: string | null
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE proyectos
    SET
      ticket_callback_url = ${params.callbackUrl},
      ticket_callback_token = ${params.callbackToken},
      updated_at = NOW()
    WHERE id = ${params.projectId}::uuid
  `
}
