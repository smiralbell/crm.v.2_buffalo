-- Conexiones OAuth Google Calendar (tokens cifrados)
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key TEXT NOT NULL UNIQUE,
  google_email TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  expiry_date TIMESTAMPTZ,
  scopes TEXT,
  needs_reauth BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_owner
  ON google_calendar_connections (owner_key);
