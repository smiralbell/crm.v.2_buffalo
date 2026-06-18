-- Puente CRM ↔ Engranaje 5 (ejecutar después de crear las tablas base)
-- Vincula proyectos con leads/contactos del CRM Buffalo

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS lead_id    INTEGER UNIQUE,
  ADD COLUMN IF NOT EXISTS contact_id INTEGER,
  ADD COLUMN IF NOT EXISTS config_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_proyectos_lead_id    ON proyectos(lead_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_contact_id ON proyectos(contact_id);
