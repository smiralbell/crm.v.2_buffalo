-- Eventos de Meta Lead Ads (webhook Page leadgen)
-- POST /api/webhooks/meta — persistencia + reintentos

CREATE TABLE IF NOT EXISTS meta_lead_events (
  id             SERIAL PRIMARY KEY,
  leadgen_id     TEXT NOT NULL UNIQUE,
  page_id        TEXT,
  form_id        TEXT,
  ad_id          TEXT,
  payload        JSONB NOT NULL,
  graph_payload  JSONB,
  status         TEXT NOT NULL DEFAULT 'pending',
  attempts       INT NOT NULL DEFAULT 0,
  last_error     TEXT,
  contact_id     INT,
  lead_id        INT,
  next_retry_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_events_retry
  ON meta_lead_events (status, next_retry_at);
