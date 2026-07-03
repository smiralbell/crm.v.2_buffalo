-- Frase inicial del agente Retell (begin_message) — ejecutar en PostgreSQL
ALTER TABLE demos
  ADD COLUMN IF NOT EXISTS frase_inicial TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN demos.frase_inicial IS 'Primer mensaje del agente Retell (begin_message); admite {{nombre}}, {{telefono}}, etc.';
