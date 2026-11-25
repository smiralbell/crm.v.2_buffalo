-- Flujos de Retención (pestaña Sistema): prompt + herramientas (MCP, incidencias, tickets) + disparador de tiempo.
-- Se crean también al primer uso desde lib/retencion/flujos/store.ts.

CREATE TABLE IF NOT EXISTS retencion_flujos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id      UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  prompt           TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 0,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  tools            TEXT[] NOT NULL DEFAULT ARRAY['mcp','incidencias','tickets'],
  last_run_at      TIMESTAMPTZ,
  next_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retencion_flujo_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flujo_id    UUID NOT NULL REFERENCES retencion_flujos(id) ON DELETE CASCADE,
  trigger     TEXT NOT NULL,
  status      TEXT NOT NULL,
  output      JSONB,
  trace       JSONB NOT NULL DEFAULT '[]'::jsonb,
  error       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_retencion_flujos_proyecto ON retencion_flujos (proyecto_id);
CREATE INDEX IF NOT EXISTS idx_retencion_flujo_runs_flujo ON retencion_flujo_runs (flujo_id, started_at DESC);
