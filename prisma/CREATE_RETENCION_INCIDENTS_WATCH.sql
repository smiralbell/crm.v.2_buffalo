-- Incidencias de retención (webhook universal) y vigilancia periódica del agente.

CREATE TABLE IF NOT EXISTS retencion_incidents (
  id            BIGSERIAL PRIMARY KEY,
  proyecto_id   UUID NOT NULL,
  error_text    TEXT NOT NULL,
  error_hash    TEXT NOT NULL,
  payload       JSONB,
  status        TEXT NOT NULL DEFAULT 'open',
  occurrences   INT NOT NULL DEFAULT 1,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solved_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_nagged_at TIMESTAMPTZ
);

ALTER TABLE retencion_incidents ADD COLUMN IF NOT EXISTS last_nagged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS retencion_incidents_proyecto_created
  ON retencion_incidents (proyecto_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS retencion_incidents_open_hash
  ON retencion_incidents (proyecto_id, error_hash)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS retencion_watch_runs (
  id           BIGSERIAL PRIMARY KEY,
  proyecto_id  UUID NOT NULL,
  ok           BOOLEAN NOT NULL DEFAULT TRUE,
  report       TEXT,
  graph        JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS retencion_watch_runs_proyecto
  ON retencion_watch_runs (proyecto_id, created_at DESC);

ALTER TABLE retencion_agent_configs
  ADD COLUMN IF NOT EXISTS watch_every_minutes INT,
  ADD COLUMN IF NOT EXISTS watch_last_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS watch_last_report TEXT,
  ADD COLUMN IF NOT EXISTS watch_last_graph JSONB,
  ADD COLUMN IF NOT EXISTS watch_prompt TEXT,
  ADD COLUMN IF NOT EXISTS watch_model TEXT,
  ADD COLUMN IF NOT EXISTS watch_excluded_tables JSONB,
  ADD COLUMN IF NOT EXISTS watch_excluded_columns JSONB,
  ADD COLUMN IF NOT EXISTS watch_last_pack JSONB;

CREATE TABLE IF NOT EXISTS retencion_watch_memory (
  proyecto_id     UUID PRIMARY KEY,
  summary         TEXT,
  schema_snapshot JSONB,
  watermarks      JSONB,
  last_delta_at   TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
