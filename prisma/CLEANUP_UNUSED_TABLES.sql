-- Limpieza DB CRM Buffalo (tablas muertas / legacy / debug)
-- Aplicada parcialmente en 2026-07-17. Conservar por si hay que repetir en otro entorno.

CREATE TABLE IF NOT EXISTS finance_ai_analyses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_json JSONB NOT NULL,
  model        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_ai_analyses_created_at
  ON finance_ai_analyses(created_at DESC);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

DROP TABLE IF EXISTS invoice_template;
DROP TABLE IF EXISTS marketing_outreach_contacts;
DROP TABLE IF EXISTS instantly_webhooks_debug;
DROP TABLE IF EXISTS project_ai_analyses CASCADE;
DROP TABLE IF EXISTS project_journal_entries CASCADE;
DROP TABLE IF EXISTS evaluation_projects CASCADE;
