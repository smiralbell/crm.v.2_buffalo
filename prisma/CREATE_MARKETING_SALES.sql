-- Embudo, leads parados y revisión semanal de Marketing (lib/marketing/sales.ts).
-- Solo crea tablas nuevas. No modifica leads, contactos ni el pipeline. Idempotente: el CRM también las crea solas.
CREATE TABLE IF NOT EXISTS marketing_card_stage (
  card_id     TEXT PRIMARY KEY,
  contact_id  INTEGER NOT NULL,
  stage       TEXT NOT NULL,
  prev_stage  TEXT,
  since       TIMESTAMPTZ NOT NULL,
  exact       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_marketing_card_stage_contact ON marketing_card_stage (contact_id);
CREATE TABLE IF NOT EXISTS marketing_stage_events (
  id          SERIAL PRIMARY KEY,
  card_id     TEXT NOT NULL,
  contact_id  INTEGER NOT NULL,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_stage_events_at ON marketing_stage_events (at);
CREATE TABLE IF NOT EXISTS marketing_lead_outcomes (
  lead_id          INTEGER PRIMARY KEY,
  perdido          BOOLEAN NOT NULL DEFAULT FALSE,
  motivo           TEXT,
  encaja           BOOLEAN,
  no_presentado    BOOLEAN NOT NULL DEFAULT FALSE,
  nota             TEXT,
  estado_anterior  TEXT,
  updated_by       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketing_lead_followups (
  lead_id       INTEGER PRIMARY KEY,
  contacted_at  TIMESTAMPTZ,
  snooze_until  TIMESTAMPTZ,
  task_id       TEXT,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketing_reviews (
  week_start  DATE PRIMARY KEY,
  notas       TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS marketing_review_decisions (
  id          SERIAL PRIMARY KEY,
  week_start  DATE NOT NULL,
  texto       TEXT NOT NULL,
  user_id     INTEGER NOT NULL,
  user_name   TEXT NOT NULL,
  due_date    DATE,
  task_id     TEXT,
  resultado   TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_review_decisions_week ON marketing_review_decisions (week_start);
