-- Envíos de formularios web.
-- POST /api/webhooks/webform  { site, page, form: { …campos } }
-- Ya no se usa n8n ni INSERT directo. Formación y el resto de webs van al mismo webhook.

CREATE TABLE IF NOT EXISTS web_form_submissions (
  id            SERIAL PRIMARY KEY,
  payload       JSONB NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'contactado', 'descartado')),
  notas         TEXT,
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_form_submissions_created_at
  ON web_form_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_form_submissions_estado
  ON web_form_submissions (estado);

COMMENT ON TABLE web_form_submissions IS
  'Formularios web vía POST /api/webhooks/webform. payload = { site, page, form: {…} }';
