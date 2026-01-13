-- Agregar columna balance a bank_transactions
-- Ejecutar este script en PostgreSQL

ALTER TABLE "public"."bank_transactions" 
ADD COLUMN "balance" NUMERIC(12,2) NULL;

-- Crear índice para mejorar consultas por balance
CREATE INDEX "idx_bank_transactions_balance" 
ON "public"."bank_transactions" ("balance");

-- Crear índice compuesto para obtener el saldo más reciente
CREATE INDEX "idx_bank_transactions_account_date_balance" 
ON "public"."bank_transactions" ("account_id", "date" DESC, "created_at" DESC);
