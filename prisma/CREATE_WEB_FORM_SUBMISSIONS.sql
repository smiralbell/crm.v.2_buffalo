-- Envíos de formularios web (n8n → PostgreSQL)
-- Solo guarda el JSON completo; el CRM extrae los campos.

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
  'Formularios web desde n8n. payload = { cuerpo: {...}, etiqueta } o [{ ... }]';

-- n8n (Postgres node) — una sola columna, JSON entero:
-- INSERT INTO web_form_submissions (payload) VALUES ($1::jsonb);
-- Parámetro $1: {{ JSON.stringify($json) }}
--
-- Si n8n devuelve el array completo:
-- {{ JSON.stringify($input.all().map(i => i.json)) }}
--
-- Si devuelve un item suelto { cuerpo, etiqueta }:
-- {{ JSON.stringify($json) }}
