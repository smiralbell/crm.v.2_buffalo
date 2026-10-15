-- Flujo Sistema (retención): exclusiones de tablas/columnas y último paquete limpio.

ALTER TABLE retencion_agent_configs
  ADD COLUMN IF NOT EXISTS watch_excluded_tables JSONB,
  ADD COLUMN IF NOT EXISTS watch_excluded_columns JSONB,
  ADD COLUMN IF NOT EXISTS watch_last_pack JSONB;

ALTER TABLE retencion_watch_memory
  ADD COLUMN IF NOT EXISTS schema_snapshot JSONB;

CREATE INDEX IF NOT EXISTS retencion_watch_runs_proyecto
  ON retencion_watch_runs (proyecto_id, created_at DESC);
