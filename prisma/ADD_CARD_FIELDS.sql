-- Agregar campos adicionales a pipeline_cards
-- Ejecutar este SQL en PostgreSQL para agregar los nuevos campos

ALTER TABLE "public"."pipeline_cards"
  ADD COLUMN IF NOT EXISTS "capture_date" TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS "amount" DECIMAL(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS "notes" TEXT NULL;

-- Comentarios para documentación
COMMENT ON COLUMN "public"."pipeline_cards"."capture_date" IS 'Fecha de captación del lead';
COMMENT ON COLUMN "public"."pipeline_cards"."amount" IS 'Cantidad de dinero del objeto';
COMMENT ON COLUMN "public"."pipeline_cards"."notes" IS 'Notas adicionales sobre la tarjeta';

