-- Vincular factura emitida con el movimiento bancario (cobro) en Ingresos
ALTER TABLE "public"."invoices"
  ADD COLUMN IF NOT EXISTS "bank_transaction_id" UUID NULL;

CREATE INDEX IF NOT EXISTS "idx_invoices_bank_transaction_id"
  ON "public"."invoices" ("bank_transaction_id");
