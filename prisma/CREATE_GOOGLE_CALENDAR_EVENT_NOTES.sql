-- Notas propias del CRM sobre eventos de Google Calendar (por usuario conectado)
CREATE TABLE IF NOT EXISTS google_calendar_event_notes (
  id SERIAL PRIMARY KEY,
  owner_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_key, event_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_event_notes_owner
  ON google_calendar_event_notes (owner_key, updated_at DESC);
