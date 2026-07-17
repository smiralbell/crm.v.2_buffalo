-- Tarjetas inteligentes: validación Buffalo, alertas de inactividad y colores por asignado

ALTER TABLE project_dev_tasks DROP CONSTRAINT IF EXISTS project_dev_tasks_status_check;

ALTER TABLE project_dev_tasks
  ADD CONSTRAINT project_dev_tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'buffalo_validation', 'done'));

ALTER TABLE project_dev_tasks
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS stale_extension_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stale_notice_active BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE project_dev_tasks
SET status_changed_at = COALESCE(status_changed_at, updated_at, created_at)
WHERE status_changed_at IS NULL;
