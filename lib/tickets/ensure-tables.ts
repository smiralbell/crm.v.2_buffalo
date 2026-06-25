import { prisma } from '@/lib/prisma'

/**
 * PostgreSQL no permite varias sentencias en un solo prepared statement.
 * Cada CREATE TABLE / INDEX va en su propia llamada.
 */
const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tickets (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_project_external
    ON tickets(project_id, external_id) WHERE external_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS ticket_field_discoveries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    field_key        TEXT NOT NULL,
    sample_value     TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, field_key)
  )`,
]

let tablesEnsured = false

export async function ensureTicketTables(): Promise<void> {
  if (tablesEnsured) return

  for (const sql of DDL_STATEMENTS) {
    await prisma.$executeRawUnsafe(sql)
  }

  tablesEnsured = true
}
