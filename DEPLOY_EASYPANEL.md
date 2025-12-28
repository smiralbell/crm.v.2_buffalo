# 🚀 Guía de Deploy en EasyPanel

Guía completa para desplegar el CRM Buffalo en EasyPanel.

## 📋 Requisitos Previos

- [ ] Repositorio en GitHub
- [ ] Base de datos PostgreSQL creada y accesible
- [ ] Cuenta en EasyPanel

## 🔧 Variables de Entorno

Configura estas variables en EasyPanel:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL completa de PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `CRM_ADMIN_EMAIL` | Email del administrador | `admin@buffalo.ai` |
| `CRM_ADMIN_PASSWORD` | Contraseña del administrador | `tu-password-seguro` |
| `SESSION_SECRET` | Secret para cookies | Genera con: `openssl rand -base64 32` |
| `NODE_ENV` | Entorno | `production` |
| `PORT` | Puerto (opcional) | `3000` |

## 📤 Pasos de Deploy

### 1. Preparar GitHub

```bash
git init
git add .
git commit -m "Initial commit: CRM Buffalo ready for production"
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

### 2. Configurar en EasyPanel

1. **Crear nueva aplicación**
   - Tipo: Docker
   - Fuente: GitHub
   - Repositorio: Tu repositorio
   - Branch: `main`

2. **Configurar variables de entorno**
   - Agrega todas las variables listadas arriba
   - **NO** incluyas comillas en los valores

3. **Configurar puerto**
   - Puerto: `3000`
   - Health Check: `/api/health`
   - Expected Status: `200`

4. **Deploy**
   - EasyPanel detectará el Dockerfile automáticamente
   - El build generará Prisma Client y construirá Next.js
   - **No se ejecutan migraciones** (las tablas deben existir)

### 3. Verificar Deploy

1. **Health Check:**
   ```
   https://tu-dominio/api/health
   ```
   Debe devolver: `{"status":"ok","database":"connected",...}`

2. **Login:**
   - Usa `CRM_ADMIN_EMAIL` y `CRM_ADMIN_PASSWORD`

## ⚠️ Notas Importantes

- **Base de datos:** Debe estar creada y accesible antes del deploy
- **Tablas:** Se crean manualmente ejecutando los SQL en `prisma/`
- **Prisma:** Solo genera el cliente, no ejecuta migraciones
- **Variables:** Todas las variables son obligatorias excepto `PORT`

## 🐛 Solución de Problemas

### Error: "DATABASE_URL no está configurado"
- Verifica que la variable esté en EasyPanel
- Revisa que no tenga espacios o comillas

### Error: "Cannot connect to database"
- Verifica que `DATABASE_URL` sea correcta
- Asegúrate de que la BD sea accesible desde EasyPanel
- Revisa firewall/red si es BD externa

### Error: "Table does not exist"
- Ejecuta los scripts SQL en `prisma/` en tu PostgreSQL
- Verifica que las tablas estén creadas

### Health check falla
- Revisa los logs en EasyPanel
- Verifica que `DATABASE_URL` sea correcta
- Asegúrate de que Prisma Client se generó correctamente
