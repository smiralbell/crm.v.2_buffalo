-- Campañas Meta Ads (Marketing API) + estadísticas diarias
-- Sync: scheduler interno cada hora y GET/POST /api/cron/meta-ads

CREATE TABLE IF NOT EXISTS meta_ad_campaigns (
  id                TEXT PRIMARY KEY,
  ad_account_id     TEXT NOT NULL,
  name              TEXT NOT NULL,
  status            TEXT,
  effective_status  TEXT,
  objective         TEXT,
  daily_budget      NUMERIC(14, 2),
  lifetime_budget   NUMERIC(14, 2),
  budget_remaining  NUMERIC(14, 2),
  currency          TEXT,
  start_time        TIMESTAMPTZ,
  stop_time         TIMESTAMPTZ,
  created_time      TIMESTAMPTZ,
  updated_time      TIMESTAMPTZ,
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_ad_campaign_daily_stats (
  campaign_id         TEXT NOT NULL,
  stat_date           DATE NOT NULL,
  ad_account_id       TEXT NOT NULL,
  spend               NUMERIC(14, 2),
  impressions         BIGINT,
  reach               BIGINT,
  link_clicks         BIGINT,
  landing_page_views  BIGINT,
  leads               BIGINT,
  cpc                 NUMERIC(14, 4),
  cost_per_lead       NUMERIC(14, 4),
  currency            TEXT,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, stat_date)
);

CREATE TABLE IF NOT EXISTS meta_ad_period_reach (
  campaign_id   TEXT NOT NULL,
  ad_account_id TEXT NOT NULL,
  date_start    DATE NOT NULL,
  date_stop     DATE NOT NULL,
  reach         BIGINT,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, date_start, date_stop)
);

CREATE TABLE IF NOT EXISTS meta_ad_sync_state (
  ad_account_id   TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ,
  last_since      DATE,
  last_until      DATE,
  last_error      TEXT,
  campaigns       INT NOT NULL DEFAULT 0,
  days            INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_account_date
  ON meta_ad_campaign_daily_stats (ad_account_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_meta_ad_campaigns_account
  ON meta_ad_campaigns (ad_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_campaign
  ON meta_lead_events (campaign_id);
