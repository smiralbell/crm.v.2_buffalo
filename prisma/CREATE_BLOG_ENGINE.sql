-- Módulo Blog (motor de contenidos de buffaloia.com).
-- Una sola tabla propia. No toca ninguna tabla existente del CRM.
-- Ejecutar una vez en la base de datos de producción antes de activar el módulo.

CREATE TABLE IF NOT EXISTS blog_docs (
  collection TEXT        NOT NULL,
  id         TEXT        NOT NULL,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS blog_docs_collection_idx ON blog_docs (collection);
