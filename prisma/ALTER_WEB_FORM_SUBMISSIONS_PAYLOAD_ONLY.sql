-- Migración: tabla antigua con columnas sueltas → solo payload JSONB
-- Ejecutar solo si ya creaste web_form_submissions con el esquema anterior.

ALTER TABLE web_form_submissions
  ADD COLUMN IF NOT EXISTS payload JSONB;

UPDATE web_form_submissions
SET payload = jsonb_build_object(
  'cuerpo', jsonb_build_object(
    'fullname', fullname,
    'email', email,
    'company', company,
    'phone', phone,
    'service', service,
    'calls', calls,
    'source', source,
    'page_url', page_url,
    'timestamp', submitted_at
  ),
  'etiqueta', COALESCE(etiqueta, 'automatizaciones')
)
WHERE payload IS NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'web_form_submissions' AND column_name = 'fullname'
  );

ALTER TABLE web_form_submissions
  ALTER COLUMN payload SET NOT NULL;

ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS etiqueta;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS fullname;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS email;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS company;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS phone;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS service;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS calls;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS source;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS page_url;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS submitted_at;
ALTER TABLE web_form_submissions DROP COLUMN IF EXISTS raw_payload;

DROP INDEX IF EXISTS idx_web_form_submissions_submitted_at;
DROP INDEX IF EXISTS idx_web_form_submissions_etiqueta;
DROP INDEX IF EXISTS idx_web_form_submissions_email;

CREATE INDEX IF NOT EXISTS idx_web_form_submissions_created_at
  ON web_form_submissions (created_at DESC);
