-- Informes de Análisis IA a nivel empresa (guía CRM)
CREATE TABLE IF NOT EXISTS crm_company_ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_json JSONB NOT NULL,
  snapshot_json JSONB,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_company_ai_analyses_created
  ON crm_company_ai_analyses (created_at DESC);
