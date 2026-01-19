-- ============================================
-- Sección de Tareas para CRM Buffalo AI
-- ============================================

-- Personas internas del equipo
CREATE TABLE IF NOT EXISTS "public"."team_members" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "color" TEXT NULL, -- Color para UI (ej: #3B82F6)
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Ampliar tabla de tareas existente para nueva sección de Tareas
-- (en @bases.md ya existe "public"."tasks" con columnas antiguas)
ALTER TABLE "public"."tasks"
  ADD COLUMN IF NOT EXISTS "client_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "assignee_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "project" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS "due_date" DATE,
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT now();

-- Foreign keys (se asume que solo se ejecuta una vez)
ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "public"."contacts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_assignee_id_fkey"
    FOREIGN KEY ("assignee_id") REFERENCES "public"."team_members" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Índices para filtros rápidos
CREATE INDEX IF NOT EXISTS "idx_tasks_client_id"
ON "public"."tasks" ("client_id");

CREATE INDEX IF NOT EXISTS "idx_tasks_assignee_id"
ON "public"."tasks" ("assignee_id");

CREATE INDEX IF NOT EXISTS "idx_tasks_status"
ON "public"."tasks" ("status");

CREATE INDEX IF NOT EXISTS "idx_tasks_priority"
ON "public"."tasks" ("priority");

CREATE INDEX IF NOT EXISTS "idx_tasks_due_date"
ON "public"."tasks" ("due_date");


