import { prisma } from '@/lib/prisma'
import type { IngestedTicket } from './ingest'

export async function discoverTicketFields(
  projectId: string,
  customFields: Record<string, unknown>
): Promise<void> {
  for (const [field_key, value] of Object.entries(customFields)) {
    if (value === null || value === undefined) continue
    const sample =
      typeof value === 'object' ? JSON.stringify(value).slice(0, 500) : String(value).slice(0, 500)

    await prisma.$executeRaw`
      INSERT INTO ticket_field_discoveries (project_id, field_key, sample_value, occurrence_count, first_seen_at, last_seen_at)
      VALUES (${projectId}::uuid, ${field_key}, ${sample}, 1, NOW(), NOW())
      ON CONFLICT (project_id, field_key)
      DO UPDATE SET
        occurrence_count = ticket_field_discoveries.occurrence_count + 1,
        last_seen_at = NOW(),
        sample_value = COALESCE(EXCLUDED.sample_value, ticket_field_discoveries.sample_value)
    `
  }
}

export async function insertTicket(
  projectId: string,
  ticket: IngestedTicket
): Promise<{ id: string; duplicate: boolean }> {
  if (ticket.external_id) {
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM tickets
      WHERE project_id = ${projectId}::uuid
        AND external_id = ${ticket.external_id}
      LIMIT 1
    `
    if (existing[0]) {
      return { id: existing[0].id, duplicate: true }
    }
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO tickets (
      project_id, title, description, priority, status,
      reporter_name, reporter_email, source, external_id,
      payload, custom_fields
    ) VALUES (
      ${projectId}::uuid,
      ${ticket.title},
      ${ticket.description},
      ${ticket.priority},
      ${ticket.status},
      ${ticket.reporter_name},
      ${ticket.reporter_email},
      ${ticket.source},
      ${ticket.external_id},
      ${JSON.stringify(ticket.payload)}::jsonb,
      ${JSON.stringify(ticket.custom_fields)}::jsonb
    )
    RETURNING id
  `

  const id = rows[0]?.id
  if (!id) throw new Error('No se pudo crear el ticket')

  await discoverTicketFields(projectId, ticket.custom_fields)

  return { id, duplicate: false }
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

/** Identifica el proyecto desde el body del webhook (único endpoint para todos los clientes). */
export async function resolveProjectFromPayload(body: Record<string, unknown>): Promise<{
  id: string
  name: string
  config_ref: string | null
} | null> {
  const projectId = firstString(body.project_id, body.projectId)
  if (projectId) {
    const rows = await prisma.$queryRaw<
      { id: string; name: string; config_ref: string | null }[]
    >`
      SELECT id, name, config_ref
      FROM proyectos
      WHERE id = ${projectId}::uuid
      LIMIT 1
    `
    return rows[0] ?? null
  }

  const projectRef = firstString(
    body.project_ref,
    body.projectRef,
    body.config_ref,
    body.configRef
  )
  if (projectRef) {
    const rows = await prisma.$queryRaw<
      { id: string; name: string; config_ref: string | null }[]
    >`
      SELECT id, name, config_ref
      FROM proyectos
      WHERE config_ref = ${projectRef}
      LIMIT 1
    `
    return rows[0] ?? null
  }

  return null
}
