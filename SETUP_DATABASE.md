# 🗄️ Configuración de Base de Datos

## ⚠️ Error Resuelto: DATABASE_URL

El archivo `.env` ya está creado con la configuración básica. Ahora necesitas configurar PostgreSQL.

## 📋 Pasos para Configurar la Base de Datos

### 1. Verificar que PostgreSQL esté Instalado

Abre una terminal y ejecuta:
```bash
psql --version
```

Si no está instalado, descárgalo de: https://www.postgresql.org/download/

### 2. Iniciar PostgreSQL

Asegúrate de que el servicio de PostgreSQL esté ejecutándose:
- **Windows**: Busca "Services" y verifica que "postgresql-x64-XX" esté en ejecución
- O ejecuta: `net start postgresql-x64-XX` (reemplaza XX con tu versión)

### 3. Crear la Base de Datos

Abre `psql` o pgAdmin y ejecuta:

```sql
-- Conectar a PostgreSQL (usuario por defecto: postgres)
-- Si te pide contraseña, usa la que configuraste durante la instalación

-- Crear la base de datos
CREATE DATABASE crm_buffalo;

-- Verificar que se creó
\l
```

### 4. Configurar el Archivo .env

Edita el archivo `.env` en la raíz del proyecto y ajusta según tu configuración:

```env
# Si tu usuario NO es 'postgres', cámbialo
# Si tu contraseña NO es 'postgres', cámbiala
# Si tu puerto NO es 5432, cámbialo

DATABASE_URL=postgresql://TU_USUARIO:TU_CONTRASEÑA@localhost:5432/crm_buffalo
SESSION_SECRET=tu-secret-key-aqui-cambiar-en-produccion
NODE_ENV=development
PORT=3000
```

**Ejemplo si tu usuario es `admin` y tu contraseña es `mipassword123`:**
```env
DATABASE_URL=postgresql://admin:mipassword123@localhost:5432/crm_buffalo
```

### 5. Ejecutar las Migraciones

Una vez configurado todo, ejecuta:

```bash
# Generar Prisma Client
npm run prisma:generate

# Crear las tablas en la base de datos
npm run prisma:migrate

# Crear el usuario inicial (admin@buffalo.ai / admin123)
npm run prisma:seed
```

## 🔍 Verificar la Conexión

Si quieres verificar que la conexión funciona, puedes ejecutar:

```bash
npx prisma db pull
```

Esto intentará conectarse a la base de datos y mostrará cualquier error.

## ❓ Solución de Problemas

### Error: "password authentication failed"
- Verifica que la contraseña en `.env` sea correcta
- Si olvidaste la contraseña, puedes resetearla en PostgreSQL

### Error: "database does not exist"
- Asegúrate de haber creado la base de datos `crm_buffalo`
- Verifica que el nombre en `DATABASE_URL` coincida

### Error: "connection refused"
- Verifica que PostgreSQL esté ejecutándose
- Verifica que el puerto sea correcto (por defecto 5432)

## ✅ Una vez configurado

Después de completar estos pasos, podrás ejecutar:
```bash
npm run dev
```

Y el CRM estará listo para usar en `http://localhost:3000`

