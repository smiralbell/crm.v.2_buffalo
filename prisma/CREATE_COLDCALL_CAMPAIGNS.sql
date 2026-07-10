-- Cold Calling v2: campañas, import Apollo, pipeline extendido

CREATE TABLE IF NOT EXISTS coldcall_campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  assigned_to_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL,
  created_by_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coldcall_campaigns_status ON coldcall_campaigns(status, created_at DESC);

CREATE TABLE IF NOT EXISTS coldcall_import_batches (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES coldcall_campaigns(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  imported_by_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_skipped_duplicate INTEGER NOT NULL DEFAULT 0,
  rows_skipped_dnc INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coldcall_import_batches_campaign
  ON coldcall_import_batches(campaign_id, created_at DESC);

ALTER TABLE coldcall_prospects
  ADD COLUMN IF NOT EXISTS campaign_id INTEGER REFERENCES coldcall_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id INTEGER REFERENCES coldcall_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'nuevo',
  ADD COLUMN IF NOT EXISTS call_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS employee_count INTEGER,
  ADD COLUMN IF NOT EXISTS apollo_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS apollo_data JSONB,
  ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS synced_to_crm_as TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coldcall_prospects_dedupe_campaign
  ON coldcall_prospects(campaign_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL AND campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coldcall_prospects_campaign_stage
  ON coldcall_prospects(campaign_id, stage)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coldcall_prospects_queue
  ON coldcall_prospects(campaign_id, next_retry_at, stage)
  WHERE deleted_at IS NULL AND do_not_call = FALSE;

CREATE TABLE IF NOT EXISTS coldcall_activities (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES coldcall_prospects(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  content TEXT,
  outcome TEXT,
  auto BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coldcall_activities_prospect
  ON coldcall_activities(prospect_id, created_at DESC);

-- Prospectos existentes → stage en_cola si estaban pendientes
UPDATE coldcall_prospects
SET stage = CASE
  WHEN estado = 'reunion_agendada' THEN 'reunion_agendada'
  WHEN estado = 'interesado' THEN 'interesado_info_enviada'
  WHEN estado = 'no_interesado' THEN 'no_interesado'
  WHEN estado = 'llamar_tarde' THEN 'volver_a_llamar'
  WHEN estado IN ('sin_respuesta', 'buzon_voz') THEN 'en_cola'
  WHEN estado = 'no_contactar' THEN 'no_interesado'
  ELSE 'en_cola'
END
WHERE stage = 'nuevo' OR stage IS NULL;

-- Mapeo de columnas CSV por campaña
ALTER TABLE coldcall_campaigns
  ADD COLUMN IF NOT EXISTS import_columns JSONB,
  ADD COLUMN IF NOT EXISTS column_mapping JSONB;

-- Campos adicionales en prospectos
ALTER TABLE coldcall_prospects
  ADD COLUMN IF NOT EXISTS cif TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT;

ALTER TABLE coldcall_campaigns
  ADD COLUMN IF NOT EXISTS script_markdown_es TEXT,
  ADD COLUMN IF NOT EXISTS script_markdown_ca TEXT;
