-- Engranaje 3 · Retención
-- Añade columnas para saber qué proyectos tienen mantenimiento mensual contratado.
-- Ejecutar manualmente en PostgreSQL (después de CREATE_ENGRANAJE5_CRM_BRIDGE.sql).

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS has_mensualidad BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maint_plan          TEXT;

COMMENT ON COLUMN proyectos.has_mensualidad IS
  'TRUE = cliente con mantenimiento mensual (aparece en Engranaje 3 · Retención)';

COMMENT ON COLUMN proyectos.maint_plan IS
  'Plan de mantenimiento: connect (Buffalo Connect 10%) | cloud (Buffalo Cloud 15%) | NULL';

CREATE INDEX IF NOT EXISTS idx_proyectos_mensualidad
  ON proyectos (has_mensualidad)
  WHERE has_mensualidad = true;

-- Backfill: proyectos que ya tenían cuota mensual guardada
UPDATE proyectos
SET has_mensualidad = true
WHERE monthly_fee_eur IS NOT NULL
  AND monthly_fee_eur > 0
  AND has_mensualidad = false;
