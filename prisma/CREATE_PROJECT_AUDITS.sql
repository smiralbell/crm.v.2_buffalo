-- Auditorías de onboarding (copiloto estructurado)
CREATE TABLE IF NOT EXISTS project_audits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       INTEGER NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  project_types TEXT[] NOT NULL DEFAULT '{}',
  active_mode   TEXT NOT NULL DEFAULT 'descubrimiento',
  active_area   TEXT NOT NULL DEFAULT 'negocio',
  structured    JSONB NOT NULL DEFAULT '{}'::jsonb,
  conversation  JSONB NOT NULL DEFAULT '[]'::jsonb,
  context       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'in_progress',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_audits_lead_id ON project_audits (lead_id);
CREATE INDEX IF NOT EXISTS idx_project_audits_status ON project_audits (status);

COMMENT ON TABLE project_audits IS 'Copiloto de auditoría onboarding: JSON estructurado + conversación guiada';
