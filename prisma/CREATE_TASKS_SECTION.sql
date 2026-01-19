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

-- Tabla de tareas
-- Regla: todas las tareas deben estar ligadas a un cliente (contact) y a un proyecto (texto)
CREATE TABLE IF NOT EXISTS "public"."tasks" (
  "id" SERIAL PRIMARY KEY,

  -- Relaciones
  "client_id" INTEGER NOT NULL,
  "assignee_id" INTEGER NOT NULL,

  -- Datos de negocio
  "title" TEXT NOT NULL,
  "description" TEXT NULL,
  "project" TEXT NOT NULL, -- Nombre del proyecto (texto libre pero consistente)
  "priority" TEXT NOT NULL, -- low | medium | high
  "status" TEXT NOT NULL DEFAULT 'todo', -- todo | doing | done
  "due_date" DATE NULL,
  "completed_at" TIMESTAMP NULL,

  -- Metadatos
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."contacts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."team_members" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

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


