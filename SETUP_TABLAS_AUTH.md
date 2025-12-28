# 🔐 Crear Tablas de Autenticación

## ⚠️ IMPORTANTE: Ejecutar este script SQL primero

Antes de continuar, necesitas ejecutar el script SQL para crear las tablas de autenticación (`users` y `sessions`) que faltan en tu base de datos.

## 📋 Pasos:

### 1. Conectarte a tu base de datos PostgreSQL

Puedes usar:
- **pgAdmin**
- **psql** (línea de comandos)
- **DBeaver**
- Cualquier cliente PostgreSQL

### 2. Ejecutar el script SQL

Abre el archivo `prisma/create_auth_tables.sql` y ejecuta su contenido en tu base de datos, o ejecuta directamente:

```sql
-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS "public"."users" (
  "id" SERIAL,
  "email" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Tabla de sesiones
CREATE TABLE IF NOT EXISTS "public"."sessions" (
  "id" SERIAL,
  "user_id" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- Índice para búsqueda rápida
CREATE INDEX IF NOT EXISTS "sessions_token_idx" ON "public"."sessions" ("token");
```

### 3. Crear usuario inicial

Después de crear las tablas, ejecuta el seed para crear el usuario admin:

```bash
npm run prisma:seed
```

O manualmente en SQL (la contraseña será 'admin123' hasheada):

```sql
-- Esto lo hace automáticamente el seed, pero si prefieres hacerlo manual:
-- La contraseña 'admin123' hasheada con bcrypt
INSERT INTO "public"."users" ("email", "password_hash", "created_at", "updated_at")
VALUES (
  'admin@buffalo.ai',
  '$2a$10$rOzJqJqJqJqJqJqJqJqJqOqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJq',
  now(),
  now()
)
ON CONFLICT ("email") DO NOTHING;
```

### 4. Generar Prisma Client

Una vez creadas las tablas, genera el cliente:

```bash
npm run prisma:generate
```

## ✅ Verificación

Para verificar que todo está correcto:

```bash
npx prisma studio
```

Esto abrirá una interfaz visual donde podrás ver todas las tablas, incluyendo `users` y `sessions`.

