-- Añadir columna IRPF a la tabla de gastos manuales
-- IRPF se guarda en euros y por defecto es 0
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "irpf_amount" NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "expenses"."irpf_amount" IS 'Retención IRPF en euros. Por defecto 0.';

