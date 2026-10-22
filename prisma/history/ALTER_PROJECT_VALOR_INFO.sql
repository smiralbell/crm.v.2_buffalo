-- Información de valor del proyecto: repositorio + contraseñas internas
ALTER TABLE project_dev_onboarding
  ADD COLUMN IF NOT EXISTS repo_url TEXT,
  ADD COLUMN IF NOT EXISTS passwords_json JSONB NOT NULL DEFAULT '[]'::jsonb;
