-- Logs del webhook de demos (ejecutar si ya tienes las tablas demos creadas)
CREATE TABLE IF NOT EXISTS demo_webhook_logs (
  id         SERIAL PRIMARY KEY,
  step       TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT 'info',
  message    TEXT NOT NULL,
  event      TEXT,
  phone      TEXT,
  demo_id    INTEGER REFERENCES demos(id) ON DELETE SET NULL,
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_webhook_logs_created
  ON demo_webhook_logs (created_at DESC);
