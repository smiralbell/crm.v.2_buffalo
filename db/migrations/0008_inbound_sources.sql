-- Tabla de logs de Instantly (antes se creaba en cada petición del webhook).
-- Los eventos crudos viven en inbound_events; esta tabla es el histórico que ya usa Marketing.

CREATE TABLE IF NOT EXISTS instantly_webhooks (
  id            SERIAL PRIMARY KEY,
  event_type    VARCHAR(255),
  email         VARCHAR(255),
  campaign_id   VARCHAR(255),
  campaign_name VARCHAR(255),
  payload       JSONB,
  status        VARCHAR(100),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_instantly_webhooks_created ON instantly_webhooks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instantly_webhooks_email ON instantly_webhooks (email);
