-- Formularios públicos de onboarding (HTML pegado → link /f/[slug])
-- El cliente rellena sin sesión CRM; los envíos van a onboarding_form_submissions.

CREATE TABLE IF NOT EXISTS onboarding_public_forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT 'Formulario',
  slug          TEXT NOT NULL,
  html          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT onboarding_public_forms_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' OR slug ~ '^[a-z0-9]{2,64}$'),
  CONSTRAINT onboarding_public_forms_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_public_forms_lead
  ON onboarding_public_forms (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_public_forms_active
  ON onboarding_public_forms (slug)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS onboarding_form_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       UUID NOT NULL REFERENCES onboarding_public_forms(id) ON DELETE CASCADE,
  lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_form_submissions_form
  ON onboarding_form_submissions (form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_form_submissions_lead
  ON onboarding_form_submissions (lead_id, created_at DESC);

COMMENT ON TABLE onboarding_public_forms IS
  'HTML público por lead. URL: /f/{slug}. Sin auth CRM.';
COMMENT ON TABLE onboarding_form_submissions IS
  'Respuestas del formulario. payload = campos name → valor del HTML.';
