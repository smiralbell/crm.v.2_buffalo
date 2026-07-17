-- Columnas que el CRM necesita para sincronizar proyectos desde Onboarding
-- Ejecutar en PostgreSQL si el autoguardado falla con errores de columnas/tablas.

-- Puente CRM
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS lead_id     INTEGER;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS contact_id  INTEGER;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS config_ref  TEXT;

-- Servicios activos (configurador)
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_mensualidad BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS maint_plan        TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_voz           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_chat          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_dash          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS has_pack          BOOLEAN NOT NULL DEFAULT false;

-- Add-ons adicionales
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS addon_crm_integration BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS addon_voice_in_chat   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS languages_count       INTEGER NOT NULL DEFAULT 1;

-- Tickets callback (opcional para sync, pero Prisma los espera)
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS ticket_callback_url   TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS ticket_callback_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_proyectos_lead_id ON proyectos(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proyectos_lead_id    ON proyectos(lead_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_contact_id ON proyectos(contact_id);

-- Defaults que el INSERT del autoguardado necesita (evita error 23502 NOT NULL)
ALTER TABLE proyectos ALTER COLUMN webhook_secret SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE proyectos ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE proyectos ALTER COLUMN updated_at SET DEFAULT NOW();
UPDATE proyectos SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL;
UPDATE proyectos SET webhook_secret = gen_random_uuid()::TEXT WHERE webhook_secret IS NULL OR webhook_secret = '';
