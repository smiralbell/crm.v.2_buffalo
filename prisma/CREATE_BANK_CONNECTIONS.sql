-- Conexión bancaria de prueba (Enable Banking) — una sesión activa global
CREATE TABLE IF NOT EXISTS bank_connections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_uid TEXT NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_created_at ON bank_connections(created_at DESC);
