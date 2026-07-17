-- Servicios activos + pack (configurador → proyectos)
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS has_voz   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_chat  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_dash  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_pack  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_proyectos_servicios
  ON proyectos (has_voz, has_chat, has_dash);
