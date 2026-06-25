-- Tickets / incidencias desde dashboards de clientes
-- Ejecutar en PostgreSQL después de la tabla proyectos

CREATE TABLE IF NOT EXISTS tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,

  title           TEXT NOT NULL,
  description     TEXT,
  priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),

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
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority   ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_project_external
  ON tickets(project_id, external_id)
  WHERE external_id IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_ticket_fields_project ON ticket_field_discoveries(project_id);
