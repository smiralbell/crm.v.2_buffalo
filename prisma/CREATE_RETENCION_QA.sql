-- Calidad de los agentes (retención): cerebro del proyecto, normas y bandeja del flujo de cambios.
-- Las tablas también se crean solas al usarlas (lib/retencion/qa/store.ts).

CREATE TABLE IF NOT EXISTS retencion_qa_brain (
  proyecto_id         UUID PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'idle',
  progress            INT NOT NULL DEFAULT 0,
  phases              JSONB NOT NULL DEFAULT '[]'::jsonb,
  brain               JSONB,
  version             INT NOT NULL DEFAULT 0,
  error               TEXT,
  repo_source         TEXT,
  repo_branch         TEXT,
  retell_key_enc      TEXT,
  tour_step           TEXT NOT NULL DEFAULT 'bienvenida',
  flow1               JSONB,
  flow1_configured    BOOLEAN NOT NULL DEFAULT FALSE,
  last_ticket_scan_at TIMESTAMPTZ,
  last_repo_sha       TEXT,
  last_repo_scan_at   TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retencion_qa_rules (
  id           BIGSERIAL PRIMARY KEY,
  proyecto_id  UUID NOT NULL,
  code         TEXT NOT NULL,
  regla        TEXT NOT NULL,
  area         TEXT,
  canal        TEXT,
  gravedad     TEXT NOT NULL DEFAULT 'media',
  estado       TEXT NOT NULL DEFAULT 'activa',
  origen_tipo  TEXT NOT NULL,
  origen_ref   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS retencion_qa_rules_code ON retencion_qa_rules (proyecto_id, code);

CREATE TABLE IF NOT EXISTS retencion_qa_inbox (
  id           BIGSERIAL PRIMARY KEY,
  proyecto_id  UUID NOT NULL,
  origen       TEXT NOT NULL,
  origen_ref   TEXT,
  titulo       TEXT NOT NULL,
  texto        TEXT NOT NULL,
  propuesta    JSONB NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendiente',
  rule_id      BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS retencion_qa_inbox_ref ON retencion_qa_inbox (proyecto_id, origen, origen_ref) WHERE origen_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS retencion_qa_inbox_proyecto ON retencion_qa_inbox (proyecto_id, created_at DESC);
