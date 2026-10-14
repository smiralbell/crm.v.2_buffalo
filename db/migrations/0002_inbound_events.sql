-- Ingesta unificada: cada webhook guarda aquí su evento crudo (idempotente por fuente + id externo)
-- antes de procesarlo. Si el proceso falla, el worker lo reintenta y se puede reprocesar a mano.

CREATE TABLE IF NOT EXISTS inbound_events (
  id               BIGSERIAL PRIMARY KEY,
  source           TEXT NOT NULL,              -- calcom | fireflies | web_chat | …
  external_id      TEXT NOT NULL,              -- id del proveedor o hash del cuerpo
  event_type       TEXT,
  payload          JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | processing | processed | ignored | failed
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error       TEXT,
  result           JSONB,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_inbound_events_due ON inbound_events (next_attempt_at)
  WHERE status IN ('pending', 'failed', 'processing');
CREATE INDEX IF NOT EXISTS idx_inbound_events_received ON inbound_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_events_source ON inbound_events (source, received_at DESC);
