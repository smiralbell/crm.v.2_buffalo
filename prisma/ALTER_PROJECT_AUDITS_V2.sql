-- Copiloto auditoría v2: preguntas, respuestas, huecos y progreso estructurados
ALTER TABLE project_audits
  ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active_question_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN project_audits.questions IS 'AuditQuestion[] — preguntas con id estable';
COMMENT ON COLUMN project_audits.answers IS 'AuditAnswer[] — respuestas vinculadas a questionId';
COMMENT ON COLUMN project_audits.gaps IS 'AuditGap[] — huecos detectados';
COMMENT ON COLUMN project_audits.progress IS 'Progreso por categoría { [category]: percentage }';
