-- Asistente personal CRM (WhatsApp demos)
-- Ejecutar en PostgreSQL (prod / local)

ALTER TABLE demos
  ADD COLUMN IF NOT EXISTS es_asistente_crm BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN demos.es_asistente_crm IS
  'Si true, el agente WhatsApp consulta el CRM en vivo (solo números autorizados).';
