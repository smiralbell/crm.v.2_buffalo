-- Añadir campo company_name a la tabla invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT 'BUFFALO AI';

