-- Demos: agentes WhatsApp de demostración
-- Ejecutar manualmente en PostgreSQL

CREATE TABLE IF NOT EXISTS demos (
  id                SERIAL PRIMARY KEY,
  nombre_cliente    TEXT NOT NULL,
  prompt            TEXT NOT NULL DEFAULT '',
  base_conocimiento TEXT NOT NULL DEFAULT '',
  estado            TEXT NOT NULL DEFAULT 'activa'
                    CHECK (estado IN ('activa', 'pausada')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demos_estado ON demos (estado);
CREATE INDEX IF NOT EXISTS idx_demos_created_at ON demos (created_at DESC);

CREATE TABLE IF NOT EXISTS demo_numeros (
  id              SERIAL PRIMARY KEY,
  demo_id         INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  numero_telefono TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_numeros_demo_id ON demo_numeros (demo_id);

-- Un teléfono solo puede pertenecer a UNA demo en todo el sistema
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_numeros_phone_global
  ON demo_numeros (numero_telefono);

CREATE TABLE IF NOT EXISTS demo_conversaciones (
  id              SERIAL PRIMARY KEY,
  demo_id         INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
  numero_telefono TEXT NOT NULL,
  messages        JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_conversaciones_demo_phone
  ON demo_conversaciones (demo_id, numero_telefono);
CREATE INDEX IF NOT EXISTS idx_demo_conversaciones_updated
  ON demo_conversaciones (updated_at DESC);

-- Si ya creaste las tablas sin índice global, ejecuta esto para migrar:
-- DROP INDEX IF EXISTS idx_demo_numeros_demo_phone;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_numeros_phone_global ON demo_numeros (numero_telefono);
