-- Checklist interno CRM (inbox / Santi / Sergi)
CREATE TABLE IF NOT EXISTS crm_checklist_items (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  column_key TEXT NOT NULL DEFAULT 'inbox',
  position INT NOT NULL DEFAULT 0,
  created_by_user_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  remind_every_days INT NOT NULL DEFAULT 1,
  remind_weekday INT,
  remind_time TEXT,
  last_reminded_at TIMESTAMPTZ
);

ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS remind_every_days INT NOT NULL DEFAULT 1;
ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;
ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS remind_weekday INT;
ALTER TABLE crm_checklist_items ADD COLUMN IF NOT EXISTS remind_time TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_checklist_column_pos
  ON crm_checklist_items (column_key, position);

CREATE INDEX IF NOT EXISTS idx_crm_checklist_done
  ON crm_checklist_items (done);
