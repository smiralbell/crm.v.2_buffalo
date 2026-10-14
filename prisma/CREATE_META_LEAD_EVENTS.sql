-- Eventos de Meta Lead Ads (webhook Page leadgen)
-- POST /api/webhooks/meta — persistencia + reintentos

CREATE TABLE IF NOT EXISTS meta_lead_events (
  id             SERIAL PRIMARY KEY,
  leadgen_id     TEXT NOT NULL UNIQUE,
  page_id        TEXT,
  page_name      TEXT,
  platform       TEXT,
  form_id        TEXT,
  form_name      TEXT,
  ad_id          TEXT,
  ad_name        TEXT,
  adset_id       TEXT,
  adset_name     TEXT,
  campaign_id    TEXT,
  campaign_name  TEXT,
  is_organic     BOOLEAN,
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

ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS page_name TEXT;
ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS form_name TEXT;
ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS ad_name TEXT;
ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS adset_id TEXT;
ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS adset_name TEXT;
ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS is_organic BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_meta_lead_events_retry
  ON meta_lead_events (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_lead
  ON meta_lead_events (lead_id);
