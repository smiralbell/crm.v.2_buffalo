-- Tabla de usuarios para autenticación basada en BD
-- Roles soportados: 'admin', 'user'

CREATE TABLE IF NOT EXISTS "public"."users" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NULL,
  "password_hash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_users_role"
ON "public"."users" ("role");


