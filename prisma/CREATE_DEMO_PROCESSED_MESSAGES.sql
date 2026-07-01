-- Evita procesar el mismo mensaje de Wasender dos veces (messages.received + messages.upsert)
CREATE TABLE IF NOT EXISTS demo_processed_messages (
  message_key TEXT PRIMARY KEY,
  demo_id     INTEGER REFERENCES demos(id) ON DELETE SET NULL,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_processed_created
  ON demo_processed_messages (created_at DESC);
