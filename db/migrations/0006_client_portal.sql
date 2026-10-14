-- Portal del cliente (primer paso: «Mis tickets»). Enlace mágico por proyecto en el dominio
-- de formularios públicos. Solo se guarda el hash del token; se puede revocar.

DO $$
BEGIN
  IF to_regclass('public.proyectos') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS client_portal_links (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id    UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      token_hash    TEXT NOT NULL UNIQUE,
      created_by    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at  TIMESTAMPTZ,
      revoked_at    TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_client_portal_links_project ON client_portal_links (project_id);
  END IF;
END $$;
