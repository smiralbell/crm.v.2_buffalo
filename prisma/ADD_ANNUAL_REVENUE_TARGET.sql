ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS annual_revenue_target NUMERIC(12, 2) NOT NULL DEFAULT 65000;

ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS annual_goal_alert_key TEXT;

INSERT INTO financial_settings (id, corporate_tax_percent, annual_revenue_target)
VALUES (1, 25, 65000)
ON CONFLICT (id) DO NOTHING;
