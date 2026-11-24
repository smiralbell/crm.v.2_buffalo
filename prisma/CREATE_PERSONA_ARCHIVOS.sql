-- Archivos por persona (onboarding): carpeta de cliente en Drive y documentos subidos.
-- Las facturas ya se vinculan con invoices.lead_id (ALTER_INVOICES_LEAD_ID.sql).
CREATE TABLE IF NOT EXISTS persona_drive_folders (
  lead_id      INTEGER PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  folder_id    TEXT NOT NULL,
  folder_name  TEXT NOT NULL,
  matched_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persona_documents (
  id             SERIAL PRIMARY KEY,
  lead_id        INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  drive_file_id  TEXT NOT NULL,
  web_link       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_persona_documents_lead ON persona_documents (lead_id, created_at DESC);
