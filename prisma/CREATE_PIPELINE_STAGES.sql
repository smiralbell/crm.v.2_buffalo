-- Columnas del pipeline Kanban (orden, nombre y color compartidos entre usuarios)
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_id, name)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline
  ON pipeline_stages(pipeline_id, position);
