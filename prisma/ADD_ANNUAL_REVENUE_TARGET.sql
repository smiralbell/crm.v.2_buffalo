ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS annual_revenue_target NUMERIC(12, 2) NOT NULL DEFAULT 65000;

ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS annual_goal_alert_key TEXT;

ALTER TABLE financial_settings
  ALTER COLUMN updated_at SET DEFAULT NOW();

INSERT INTO financial_settings (id, corporate_tax_percent, annual_revenue_target, updated_at)
VALUES (1, 25, 65000, NOW())
ON CONFLICT (id) DO NOTHING;
