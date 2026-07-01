-- Ejecutar manualmente en PostgreSQL para métricas y historial de llamadas de voz

CREATE TABLE IF NOT EXISTS demo_llamadas (
  id              SERIAL PRIMARY KEY,
  demo_id         INT NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  numero_destino  TEXT NOT NULL,
  call_id         TEXT,
  estado          VARCHAR(30) NOT NULL DEFAULT 'iniciada',
  duracion_seg    INT,
  variables       JSONB NOT NULL DEFAULT '{}',
  error_mensaje   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_llamadas_demo_id ON demo_llamadas (demo_id);
CREATE INDEX IF NOT EXISTS idx_demo_llamadas_destino ON demo_llamadas (demo_id, numero_destino);
CREATE INDEX IF NOT EXISTS idx_demo_llamadas_created ON demo_llamadas (demo_id, created_at DESC);

COMMENT ON TABLE demo_llamadas IS 'Registro de llamadas outbound/inbound de demos de voz Retell';
