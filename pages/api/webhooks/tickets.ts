import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { TICKETS_WEBHOOK_TOKEN } from '@/lib/tickets/config'
import { ingestTicketPayload } from '@/lib/tickets/ingest'
import { insertTicket, resolveProjectFromPayload } from '@/lib/tickets/store'

async function ensureTicketTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tickets (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id      UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      description     TEXT,
      priority        TEXT NOT NULL DEFAULT 'medium',
      status          TEXT NOT NULL DEFAULT 'open',
      reporter_name   TEXT,
      reporter_email  TEXT,
      source          TEXT NOT NULL DEFAULT 'dashboard',
      external_id     TEXT,
      payload         JSONB NOT NULL DEFAULT '{}',
      custom_fields   JSONB NOT NULL DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_project_external
      ON tickets(project_id, external_id) WHERE external_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS ticket_field_discoveries (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id       UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      field_key        TEXT NOT NULL,
      sample_value     TEXT,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, field_key)
    );
  `)
}

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
