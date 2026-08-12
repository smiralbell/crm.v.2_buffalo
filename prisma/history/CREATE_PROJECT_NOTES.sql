CREATE TABLE IF NOT EXISTS project_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      integer NOT NULL,
  note_date    date NOT NULL DEFAULT CURRENT_DATE,
  type         text NOT NULL DEFAULT 'reunion',
  title        text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_notes_lead ON project_notes (lead_id, note_date DESC);

CREATE TABLE IF NOT EXISTS project_research (
  lead_id      integer PRIMARY KEY,
  url          text NOT NULL,
  data         jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
