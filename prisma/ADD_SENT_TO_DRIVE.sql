-- Añadir columna sent_to_drive a la tabla invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to_drive BOOLEAN DEFAULT false;

-- Crear índice para mejorar las consultas
CREATE INDEX IF NOT EXISTS idx_invoices_sent_to_drive ON invoices(sent_to_drive);


