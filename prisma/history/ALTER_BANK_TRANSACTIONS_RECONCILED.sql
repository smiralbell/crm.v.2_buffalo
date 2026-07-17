-- Marca cobros como conciliados (verde en Ingresos) sin vincular factura del CRM.
-- Ejecutar una vez antes de MARK_INCOME_RECONCILED_BATCH.sql

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS is_reconciled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled
  ON bank_transactions (is_reconciled)
  WHERE is_reconciled = true;

COMMENT ON COLUMN bank_transactions.is_reconciled IS
  'Cobro marcado manualmente como conciliado (fila verde) sin factura vinculada';
