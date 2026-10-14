-- Stripe (enlace de pago por factura) y gasto diario de campañas (Meta / Google Ads).
-- Las APIs externas se llaman solo si hay tokens; sin ellos las tablas quedan vacías
-- y la pantalla de Sistema muestra «apagado».

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_url TEXT;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_via TEXT;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_paid_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ad_spend_daily (
  id             BIGSERIAL PRIMARY KEY,
  channel        TEXT NOT NULL,          -- meta | google
  date           DATE NOT NULL,
  campaign_id    TEXT NOT NULL DEFAULT '',
  campaign_name  TEXT,
  spend_eur      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  impressions    INTEGER,
  clicks         INTEGER,
  raw            JSONB,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, date, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_daily_period ON ad_spend_daily (channel, date);
