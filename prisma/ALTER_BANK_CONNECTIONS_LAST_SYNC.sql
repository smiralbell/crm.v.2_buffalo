-- Fecha de la última sincronización manual o reconexión bancaria
ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN bank_connections.last_synced_at IS
  'Última vez que se sincronizaron movimientos (botón actualizar o tras OAuth)';
