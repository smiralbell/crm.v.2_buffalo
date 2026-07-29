-- Costes de captación por canal / tipo (setup | monthly | commission) y periodo
CREATE TABLE IF NOT EXISTS channel_cost_overrides (
  id SERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  channel TEXT NOT NULL,
  cost_kind TEXT NOT NULL DEFAULT 'monthly',
  spend_eur NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT channel_cost_overrides_period_channel_kind_key UNIQUE (period, channel, cost_kind)
);

CREATE INDEX IF NOT EXISTS channel_cost_overrides_period_idx ON channel_cost_overrides (period);

-- Migración desde versión antigua (solo period+channel)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channel_cost_overrides' AND column_name = 'spend_eur'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channel_cost_overrides' AND column_name = 'cost_kind'
  ) THEN
    ALTER TABLE channel_cost_overrides ADD COLUMN cost_kind TEXT NOT NULL DEFAULT 'monthly';
    ALTER TABLE channel_cost_overrides DROP CONSTRAINT IF EXISTS channel_cost_overrides_period_channel_key;
    ALTER TABLE channel_cost_overrides
      DROP CONSTRAINT IF EXISTS channel_cost_overrides_period_channel_kind_key;
    ALTER TABLE channel_cost_overrides
      ADD CONSTRAINT channel_cost_overrides_period_channel_kind_key UNIQUE (period, channel, cost_kind);
  END IF;
END $$;
