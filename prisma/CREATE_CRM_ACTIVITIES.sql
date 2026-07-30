-- Historial unificado CRM (lead/contacto): notas manuales + eventos de sistema
CREATE TABLE IF NOT EXISTS crm_activities (
  id              BIGSERIAL PRIMARY KEY,
  contact_id      INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,
  -- note | call | alert | meeting | document | onboarding | status | origin | system
  title           TEXT NOT NULL,
  body            TEXT,
  meta            JSONB,
  created_by      TEXT,
  due_at          TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_contact_created
  ON crm_activities (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_activities_lead_created
  ON crm_activities (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_activities_kind
  ON crm_activities (kind);

CREATE INDEX IF NOT EXISTS idx_crm_activities_open_alerts
  ON crm_activities (due_at)
  WHERE resolved_at IS NULL AND kind = 'alert';
