-- Avisos automáticos del CRM con reglas por persona (lib/notifications).
-- notification_prefs: la configuración de cada uno. owner_key: 'comun' (correo, Telegram y
--   push compartidos), 'chat:<chat de WhatsApp>' (cada socio) o 'user:<id>' (equipo).
-- notification_outbox: la cola y el historial (enviado, en cola, no enviado y por qué).
-- Idempotente: el CRM también lo crea solo (ensureNotificationTables).

CREATE TABLE IF NOT EXISTS notification_prefs (
  owner_key   TEXT PRIMARY KEY,
  prefs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id             BIGSERIAL PRIMARY KEY,
  owner_key      TEXT NOT NULL,
  kind           TEXT NOT NULL,
  event          TEXT NOT NULL,
  channel        TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  html           TEXT,
  telegram_html  TEXT,
  url            TEXT,
  formato        TEXT NOT NULL DEFAULT 'detallado',
  digest         BOOLEAN NOT NULL DEFAULT FALSE,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  send_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedupe_key     TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_due ON notification_outbox (status, send_after);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_owner ON notification_outbox (owner_key, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe
  ON notification_outbox (owner_key, channel, dedupe_key) WHERE dedupe_key IS NOT NULL;
