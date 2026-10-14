-- Centro de notificaciones: un aviso por destinatario (campana del CRM) y preferencias
-- de WhatsApp por usuario (avisos urgentes y briefing diario).

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,          -- 0 = admin definido en .env (CRM_ADMIN_EMAIL)
  kind        TEXT NOT NULL,             -- ticket.nuevo | sistema.fallo | banco.caduca | …
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  severity    TEXT NOT NULL DEFAULT 'info', -- info | warning | urgent
  dedupe_key  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.crm_users') IS NOT NULL THEN
    ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
    ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS briefing_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
