-- Evaluación de proyectos: ejecutar en PostgreSQL (una vez)
-- Equivale a los modelos EvaluationProject, ProjectJournalEntry, ProjectAiAnalysis

CREATE TABLE IF NOT EXISTS evaluation_projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS evaluation_projects_deleted_at_idx ON evaluation_projects (deleted_at);
CREATE INDEX IF NOT EXISTS evaluation_projects_is_active_idx ON evaluation_projects (is_active);

CREATE TABLE IF NOT EXISTS project_journal_entries (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES evaluation_projects(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  rating INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_journal_entries_rating_range CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);

CREATE INDEX IF NOT EXISTS project_journal_entries_project_id_idx ON project_journal_entries (project_id);

CREATE TABLE IF NOT EXISTS project_ai_analyses (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES evaluation_projects(id) ON DELETE CASCADE,
  summary_json JSONB NOT NULL,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_ai_analyses_project_id_idx ON project_ai_analyses (project_id);
