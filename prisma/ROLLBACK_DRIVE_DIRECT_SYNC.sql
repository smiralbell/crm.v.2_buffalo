-- Revertir cambios de la integración directa con Google Drive (vuelta a n8n).
-- Ejecutar una vez en PostgreSQL del CRM (crm_buffalo).
-- No toca invoices.pdf_drive_* (esas columnas ya existían antes).

-- 1) Columnas añadidas a expenses
DROP INDEX IF EXISTS idx_expenses_sent_to_drive;

ALTER TABLE expenses DROP COLUMN IF EXISTS pdf_drive_file_id;
ALTER TABLE expenses DROP COLUMN IF EXISTS pdf_drive_url;
ALTER TABLE expenses DROP COLUMN IF EXISTS sent_to_drive;

-- 2) Tabla de cache de carpetas mensuales en Drive
DROP INDEX IF EXISTS idx_drive_carpetas_tipo_nombre;
DROP TABLE IF EXISTS drive_carpetas_facturas;
