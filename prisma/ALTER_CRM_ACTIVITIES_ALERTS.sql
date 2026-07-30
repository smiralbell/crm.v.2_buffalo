-- Alertas manuales en historial CRM
ALTER TABLE crm_activities
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_activities_open_alerts
  ON crm_activities (due_at)
  WHERE resolved_at IS NULL AND kind = 'alert';
