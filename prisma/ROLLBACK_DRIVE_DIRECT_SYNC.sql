-- Revertir cambios de la integración directa con Google Drive en el CRM (vuelta a n8n).
-- Ejecutar una vez en PostgreSQL del CRM (crm_buffalo).
-- No toca invoices.pdf_drive_* (esas columnas ya existían antes).
-- NO elimina drive_carpetas_facturas: el workflow de n8n sigue necesitándola.

-- Columnas añadidas a expenses (solo CRM)
DROP INDEX IF EXISTS idx_expenses_sent_to_drive;

ALTER TABLE expenses DROP COLUMN IF EXISTS pdf_drive_file_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS pdf_drive_url;
ALTER TABLE expenses DROP COLUMN IF EXISTS sent_to_drive;
