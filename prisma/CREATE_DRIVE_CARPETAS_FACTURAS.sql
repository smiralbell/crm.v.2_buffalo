-- Carpetas mensuales de facturas en Google Drive (cache tipo + YYYY-MM → folder id)
-- La usa el workflow de n8n al subir PDFs a FACTURAS/GASTOS o FACTURAS/EMITIDAS.
-- Ejecutar una vez en la misma base PostgreSQL que usa el nodo Postgres de n8n (crm_buffalo).

CREATE TABLE IF NOT EXISTS drive_carpetas_facturas (
  id         SERIAL PRIMARY KEY,
  tipo       TEXT NOT NULL,
  nombre     TEXT NOT NULL,
  ruta_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT drive_carpetas_facturas_tipo_nombre_key UNIQUE (tipo, nombre)
);

COMMENT ON TABLE drive_carpetas_facturas IS
  'Mapeo carpeta Drive por mes: tipo = gastos | emitidas, nombre = YYYY-MM, ruta_id = ID carpeta en Drive';

CREATE INDEX IF NOT EXISTS idx_drive_carpetas_tipo_nombre ON drive_carpetas_facturas(tipo, nombre);
