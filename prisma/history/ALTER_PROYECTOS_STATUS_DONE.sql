-- Permite status = done (finalizado, sin estar en producción).
-- active = en producción; done = desarrollo cerrado pero no live.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'proyectos'
    AND nsp.nspname = 'public'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE proyectos DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE proyectos
  ADD CONSTRAINT proyectos_status_check
  CHECK (status IN ('development', 'active', 'paused', 'churned', 'done'));
