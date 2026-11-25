-- Canal de captación confirmado a mano (lib/marketing/attribution.ts).
-- Solo crea UNA tabla nueva. No modifica leads ni contactos. Idempotente: el CRM también la
-- crea la primera vez que alguien confirma un canal o apunta un lead desde Marketing.
CREATE TABLE IF NOT EXISTS marketing_lead_attribution (
  lead_id     INTEGER PRIMARY KEY,
  canal       TEXT NOT NULL,
  via         TEXT,
  nota        TEXT,
  detectado   TEXT,
  updated_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
