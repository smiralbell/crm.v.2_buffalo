-- Registro de auditoría de cambios hechos por el MCP o el asistente de WhatsApp,
-- y atribución de marketing (UTM / gclid / fbclid) en envíos web y contactos.

CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor         TEXT NOT NULL,   -- mcp | asistente | crm:<email>
  action        TEXT NOT NULL,   -- nombre de la herramienta / acción
  target_table  TEXT,
  ok            BOOLEAN NOT NULL DEFAULT TRUE,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log (target_table, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.contacts') IS NOT NULL THEN
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS attribution JSONB;
  END IF;
  IF to_regclass('public.web_form_submissions') IS NOT NULL THEN
    ALTER TABLE web_form_submissions ADD COLUMN IF NOT EXISTS attribution JSONB;
  END IF;
  IF to_regclass('public.cal_bookings') IS NOT NULL THEN
    ALTER TABLE cal_bookings ADD COLUMN IF NOT EXISTS attribution JSONB;
  END IF;
END $$;
