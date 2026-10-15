CREATE TABLE IF NOT EXISTS ops_alert_messages (
  id          SERIAL PRIMARY KEY,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  channels    TEXT NOT NULL DEFAULT 'email,telegram',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_alert_messages_created
  ON ops_alert_messages (created_at DESC);
