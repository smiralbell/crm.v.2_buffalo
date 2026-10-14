-- Log de avisos a administradores (correo + Telegram). No es un buzón in-app.

CREATE TABLE IF NOT EXISTS admin_alerts (
  id              BIGSERIAL PRIMARY KEY,
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  link            TEXT,
  severity        TEXT NOT NULL DEFAULT 'info',
  dedupe_key      TEXT,
  email_status    TEXT,
  telegram_status TEXT,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_alerts_dedupe
  ON admin_alerts (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_alerts_created
  ON admin_alerts (created_at DESC);
