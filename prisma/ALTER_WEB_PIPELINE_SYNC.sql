-- Seguimiento de sync chat → pipeline WEB (opcional)
CREATE TABLE IF NOT EXISTS web_chat_pipeline_sync (
  session_id        TEXT PRIMARY KEY,
  contact_id        INTEGER NOT NULL,
  pipeline_card_id  TEXT,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_chat_pipeline_sync_contact
  ON web_chat_pipeline_sync (contact_id);
