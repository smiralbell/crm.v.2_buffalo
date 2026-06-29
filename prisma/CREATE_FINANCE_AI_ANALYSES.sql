-- Análisis financiero IA (CFO virtual) — ejecutar en PostgreSQL
CREATE TABLE IF NOT EXISTS finance_ai_analyses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_json JSONB NOT NULL,
  model        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_ai_analyses_created_at
  ON finance_ai_analyses(created_at DESC);
