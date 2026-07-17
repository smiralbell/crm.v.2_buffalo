-- Mapeo de columnas CSV por campaña

ALTER TABLE coldcall_campaigns
  ADD COLUMN IF NOT EXISTS import_columns JSONB,
  ADD COLUMN IF NOT EXISTS column_mapping JSONB;
