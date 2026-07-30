-- Permitir varios proyectos por lead (valor comercial = suma de setup_fee)
DROP INDEX IF EXISTS uq_proyectos_lead_id;

CREATE INDEX IF NOT EXISTS idx_proyectos_lead_id ON proyectos(lead_id)
  WHERE lead_id IS NOT NULL;
