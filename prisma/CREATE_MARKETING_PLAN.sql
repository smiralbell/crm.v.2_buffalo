-- Planificación de marketing (lib/marketing/plan.ts): calendario de contenidos.
-- SOLO crea dos tablas nuevas. No modifica ni borra nada existente.
--   marketing_plan_items: cada pieza (fecha, título, formato, canal, pilar, sector, estado, responsable, enlace, notas)
--   marketing_plan_goals: objetivos del mes (piezas, reuniones, clientes)
-- Idempotente: el CRM también lo crea solo la primera vez que se usa Planificación.
CREATE TABLE IF NOT EXISTS marketing_plan_items (
  id           SERIAL PRIMARY KEY,
  fecha        DATE NOT NULL,
  titulo       TEXT NOT NULL,
  formato      TEXT NOT NULL DEFAULT 'post',
  canal        TEXT NOT NULL DEFAULT 'instagram',
  pilar        TEXT,
  sector       TEXT,
  estado       TEXT NOT NULL DEFAULT 'idea',
  responsable  TEXT,
  enlace       TEXT,
  notas        TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_plan_items_fecha ON marketing_plan_items (fecha);
CREATE TABLE IF NOT EXISTS marketing_plan_goals (
  period              TEXT PRIMARY KEY,
  piezas_objetivo     INTEGER,
  reuniones_objetivo  INTEGER,
  clientes_objetivo   INTEGER,
  notas               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
