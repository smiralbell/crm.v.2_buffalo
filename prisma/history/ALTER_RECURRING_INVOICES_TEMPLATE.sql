-- Plantilla de factura recurrente sin obligar a copiar una factura ya guardada.
-- No borra ni reescribe las plantillas que ya existen.

ALTER TABLE recurring_invoices ALTER COLUMN source_invoice_id DROP NOT NULL;

ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_company_name TEXT;
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS client_tax_id TEXT;
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS line_description TEXT;
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS base_amount NUMERIC(12, 2);
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5, 2);
ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS next_issue_date DATE;
