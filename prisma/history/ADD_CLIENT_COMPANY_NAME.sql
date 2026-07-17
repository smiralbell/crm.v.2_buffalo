-- Añadir campo client_company_name a la tabla invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_company_name TEXT;

