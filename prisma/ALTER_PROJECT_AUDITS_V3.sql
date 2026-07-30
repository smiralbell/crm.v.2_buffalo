-- Auditoría adaptativa v3: informe preliminar + meta (notas, editor)
ALTER TABLE project_audits
  ADD COLUMN IF NOT EXISTS report JSONB NULL,
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN project_audits.report IS 'AuditReport — snapshot del informe preliminar';
COMMENT ON COLUMN project_audits.meta IS 'AuditMeta — notes, last_edited_by, active_block';
