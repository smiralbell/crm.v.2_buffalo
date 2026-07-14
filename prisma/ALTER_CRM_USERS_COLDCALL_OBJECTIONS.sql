-- Objeciones personalizadas por comercial (castellano y catalán)
ALTER TABLE crm_users
  ADD COLUMN IF NOT EXISTS coldcall_objections_es JSONB,
  ADD COLUMN IF NOT EXISTS coldcall_objections_ca JSONB;
