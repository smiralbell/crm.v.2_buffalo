-- Marca si un proyecto configurado entra como proyecto real de Buffalo.
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS es_buffalo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_proyectos_es_buffalo ON proyectos (es_buffalo);

-- Los que ya estaban en gestión siguen siendo Buffalo.
UPDATE proyectos
SET es_buffalo = TRUE
WHERE status IN ('development', 'active', 'paused')
  AND es_buffalo = FALSE;
