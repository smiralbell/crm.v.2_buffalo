-- Vincula facturas Buffalo a un lead/onboarding
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_lead_id ON invoices (lead_id);

COMMENT ON COLUMN invoices.lead_id IS 'Lead/onboarding de origen si la factura se creó desde ese proyecto';
