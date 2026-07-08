-- Metadatos de Google Drive para facturas de gastos
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS pdf_drive_file_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS pdf_drive_url TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS sent_to_drive BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_expenses_sent_to_drive ON expenses(sent_to_drive);
