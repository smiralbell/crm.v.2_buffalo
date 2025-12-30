-- Añadir campo company_address a la tabla invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_address TEXT;

