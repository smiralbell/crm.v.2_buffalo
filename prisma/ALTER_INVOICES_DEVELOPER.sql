-- Facturas emitidas por developers (vinculadas al listado admin de facturas)

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS crm_user_id INTEGER REFERENCES crm_users(id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_source TEXT NOT NULL DEFAULT 'client';

CREATE INDEX IF NOT EXISTS idx_invoices_crm_user ON invoices(crm_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_source ON invoices(invoice_source);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS developer_pdf_path TEXT;
