-- Fireflies.ai — transcripciones y resúmenes vinculados a leads/contactos
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fireflies_id TEXT NOT NULL UNIQUE,
  title TEXT,
  meeting_link TEXT,
  transcript_url TEXT,
  host_email TEXT,
  organizer_email TEXT,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  duration_minutes DOUBLE PRECISION,
  transcript TEXT,
  summary_overview TEXT,
  summary_action_items TEXT,
  summary_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending_match',
  match_reason TEXT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  raw_payload JSONB,
  fireflies_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_lead_id ON meeting_recordings (lead_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_contact_id ON meeting_recordings (contact_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_started_at ON meeting_recordings (started_at);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_status ON meeting_recordings (status);
