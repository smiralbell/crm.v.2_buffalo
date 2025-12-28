# 🚀 Guía Completa de Deploy en EasyPanel

Esta guía te llevará paso a paso para desplegar el CRM Buffalo en EasyPanel **sin errores**.

---

## 📋 TABLA DE CONTENIDOS

1. [Requisitos Previos](#requisitos-previos)
2. [Preparar el Proyecto para GitHub](#preparar-el-proyecto-para-github)
3. [Variables de Entorno](#variables-de-entorno)
4. [Deploy en EasyPanel (Paso a Paso)](#deploy-en-easypanel-paso-a-paso)
5. [Verificación Post-Deploy](#verificación-post-deploy)
6. [Solución de Problemas](#solución-de-problemas)

---

## ✅ REQUISITOS PREVIOS

Antes de empezar, asegúrate de tener:

- [ ] Cuenta en GitHub
- [ ] Repositorio GitHub creado (puede estar vacío)
- [ ] Cuenta en EasyPanel
- [ ] Base de datos PostgreSQL accesible (puede ser la de EasyPanel o externa)
- [ ] Acceso SSH al servidor (si es necesario para configurar BD)

---

## 📤 PREPARAR EL PROYECTO PARA GITHUB

### Paso 1: Verificar que no hay archivos sensibles

```bash
# Verifica que .env NO esté en el repositorio
git status

# Si aparece .env, elimínalo del tracking (NO del disco)
git rm --cached .env
```

### Paso 2: Inicializar Git (si no está inicializado)

```bash
# Inicializar repositorio
git init

# Agregar todos los archivos (excepto los del .gitignore)
git add .

# Primer commit
git commit -m "Initial commit: CRM Buffalo ready for EasyPanel"
```

### Paso 3: Conectar con GitHub

```bash
# Agregar remote (reemplaza USERNAME y REPO_NAME)
git remote add origin https://github.com/USERNAME/REPO_NAME.git

# O si prefieres SSH:
git remote add origin git@github.com:USERNAME/REPO_NAME.git

# Verificar que se agregó correctamente
git remote -v
```

### Paso 4: Subir a GitHub

```bash
# Cambiar a branch main (si no estás en main)
git branch -M main

# Subir código
git push -u origin main
```

**✅ Verifica en GitHub que:**
- El archivo `.env` NO está en el repositorio
- El archivo `.env.example` SÍ está (si lo creaste)
- El `Dockerfile` está presente
- El `.gitignore` está presente

---

## 🔐 VARIABLES DE ENTORNO

### Variables Obligatorias

Estas variables **DEBEN** estar configuradas en EasyPanel:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL completa de conexión a PostgreSQL | `postgresql://postgres:password@host:5432/crm_buffalo` |
| `CRM_ADMIN_EMAIL` | Email del administrador (único usuario) | `admin@buffalo.ai` |
| `CRM_ADMIN_PASSWORD` | Contraseña del administrador | `tu-contraseña-segura` |
| `SESSION_SECRET` | Secret para firmar cookies (genera uno aleatorio) | `openssl rand -base64 32` |
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto donde escucha la app (normalmente 3000) | `3000` |

### Generar SESSION_SECRET

```bash
# En Linux/Mac
openssl rand -base64 32

# O en Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### Formato de DATABASE_URL

```
postgresql://usuario:contraseña@host:puerto/nombre_bd
```

**Ejemplos:**
- Local: `postgresql://postgres:password@localhost:5432/crm_buffalo`
- EasyPanel: `postgresql://postgres:password@postgres.easypanel.host:5432/crm_buffalo`
- Externa: `postgresql://user:pass@db.example.com:5432/crm_buffalo`

**⚠️ IMPORTANTE:**
- Si la contraseña tiene caracteres especiales, URL-encodéalos (ej: `@` → `%40`, `&` → `%26`)
- No uses espacios en la URL
- Verifica que la base de datos exista antes del deploy

---

## 🚀 DEPLOY EN EASYPANEL (PASO A PASO)

### Paso 1: Crear Nueva Aplicación

1. Inicia sesión en EasyPanel
2. Haz clic en **"New App"** o **"Crear Aplicación"**
3. Selecciona **"GitHub"** como fuente

### Paso 2: Conectar Repositorio GitHub

1. Si es la primera vez, autoriza EasyPanel a acceder a GitHub
2. Selecciona tu organización/usuario
3. Busca y selecciona el repositorio `crm-buffalo` (o el nombre que hayas usado)
4. Selecciona la branch: **`main`** (o `master` si usas esa)

### Paso 3: Configurar Tipo de Aplicación

1. EasyPanel detectará automáticamente el `Dockerfile`
2. Tipo de app: **"Docker"** o **"Custom"**
3. **NO** selecciones "Next.js" si aparece como opción (puede usar configuración incorrecta)

### Paso 4: Configurar Build

EasyPanel debería detectar automáticamente:
- **Build Command**: (vacío, usa el Dockerfile)
- **Dockerfile Path**: `Dockerfile` (raíz del proyecto)
- **Docker Context**: `.` (raíz)

Si no se detecta automáticamente:
- **Dockerfile Path**: `./Dockerfile`
- **Build Context**: `.`

### Paso 5: Configurar Variables de Entorno

En la sección **"Environment Variables"** o **"Variables de Entorno"**, agrega:

```
DATABASE_URL=postgresql://postgres:password@host:5432/crm_buffalo
CRM_ADMIN_EMAIL=admin@buffalo.ai
CRM_ADMIN_PASSWORD=tu-contraseña-segura
SESSION_SECRET=tu-session-secret-generado
NODE_ENV=production
PORT=3000
```

**⚠️ IMPORTANTE:**
- Reemplaza todos los valores de ejemplo con los reales
- No dejes espacios alrededor del `=`
- Verifica que `DATABASE_URL` sea accesible desde el contenedor

### Paso 6: Configurar Puerto

1. En la sección **"Port"** o **"Puerto"**:
   - **Puerto Interno**: `3000`
   - **Puerto Externo**: EasyPanel lo asignará automáticamente (o configúralo si tienes opción)

2. Verifica que el puerto interno coincida con el `EXPOSE` en el Dockerfile (3000)

### Paso 7: Configurar Health Check (Opcional pero Recomendado)

1. En la sección **"Health Check"**:
   - **Path**: `/api/health`
   - **Expected Status**: `200`
   - **Interval**: `30` segundos
   - **Timeout**: `10` segundos

Esto permitirá que EasyPanel detecte si la app está funcionando correctamente.

### Paso 8: Configurar Base de Datos (Si usas PostgreSQL de EasyPanel)

Si creas la BD en EasyPanel:

1. Crea un nuevo servicio **PostgreSQL**
2. Anota la URL de conexión que te proporciona
3. Usa esa URL en `DATABASE_URL` de la app

### Paso 9: Iniciar Deploy

1. Revisa toda la configuración
2. Haz clic en **"Deploy"** o **"Desplegar"**
3. **NO cierres la pestaña** hasta que termine el build

### Paso 10: Monitorear el Build

Durante el build verás logs como:

```
Step 1/7 : FROM node:20-alpine
Step 2/7 : RUN apk add --no-cache openssl
Step 3/7 : COPY package.json package-lock.json ./
Step 4/7 : RUN npm ci
...
Step 7/7 : CMD ["npm", "start"]
```

**Tiempo estimado:** 5-10 minutos (depende del servidor)

**⚠️ Si el build falla:**
- Revisa los logs completos
- Verifica que todas las variables de entorno estén configuradas
- Verifica que `DATABASE_URL` sea accesible

---

## ✅ VERIFICACIÓN POST-DEPLOY

### Paso 1: Verificar que la App Está Corriendo

1. En EasyPanel, ve a la sección de **"Logs"**
2. Deberías ver:
   ```
   ▲ Next.js 14.2.18
   - Local:        http://localhost:3000
   - Ready in X ms
   ```

### Paso 2: Verificar Health Check

Abre en tu navegador:
```
https://tu-dominio.easypanel.host/api/health
```

Deberías ver:
```json
{
  "status": "ok",
  "database": "connected",
  "environment": "production",
  "timestamp": "2024-..."
}
```

Si ves `"database": "disconnected"`, revisa `DATABASE_URL`.

### Paso 3: Verificar la Aplicación

1. Abre la URL que te proporciona EasyPanel
2. Deberías ver la página de login
3. Inicia sesión con:
   - Email: El valor de `CRM_ADMIN_EMAIL`
   - Password: El valor de `CRM_ADMIN_PASSWORD`

### Paso 4: Verificar Base de Datos

Si es la primera vez que despliegas:

1. Las tablas deberían crearse automáticamente (si usas migraciones)
2. O crea las tablas manualmente usando el schema de Prisma

**Para crear tablas manualmente:**
```bash
# Conecta al contenedor o servidor
npx prisma migrate deploy
# O si tienes acceso SSH
npx prisma db push
```

---

## 🔧 SOLUCIÓN DE PROBLEMAS

### Error: "Cannot connect to database"

**Causa:** `DATABASE_URL` incorrecta o BD inaccesible

**Solución:**
1. Verifica que `DATABASE_URL` esté correctamente configurada
2. Verifica que la BD esté accesible desde el contenedor
3. Si la BD está en otro servidor, verifica firewall/red
4. Prueba la conexión manualmente:
   ```bash
   # Desde el contenedor o servidor
   psql "postgresql://usuario:password@host:5432/db"
   ```

### Error: "Prisma Client not generated"

**Causa:** El build falló antes de generar Prisma Client

**Solución:**
1. Verifica los logs del build
2. Asegúrate de que `npm ci` se ejecutó correctamente
3. Verifica que `package-lock.json` esté en el repositorio

### Error: "Port 3000 already in use"

**Causa:** Conflicto de puertos

**Solución:**
1. En EasyPanel, cambia el puerto interno a otro (ej: 3001)
2. Actualiza `EXPOSE 3001` en Dockerfile (si es necesario)
3. O configura `PORT=3001` en variables de entorno

### Error: "Module not found" o "Cannot find module"

**Causa:** Dependencias no instaladas correctamente

**Solución:**
1. Verifica que `package.json` y `package-lock.json` estén en el repo
2. Revisa los logs del build para ver si `npm ci` falló
3. Verifica que no haya errores de red durante la instalación

### Error: "Health check failed"

**Causa:** La app no responde en `/api/health`

**Solución:**
1. Verifica los logs de la aplicación
2. Verifica que la app esté corriendo (`npm start` exitoso)
3. Verifica que el puerto sea correcto
4. Prueba acceder manualmente a `/api/health`

### Error: "Build timeout"

**Causa:** El build tarda demasiado

**Solución:**
1. Verifica que no haya procesos bloqueantes
2. Considera optimizar el Dockerfile (aunque ya está optimizado)
3. Contacta soporte de EasyPanel si persiste

### La app funciona pero no se conecta a la BD

**Causa:** Variables de entorno no cargadas o BD inaccesible

**Solución:**
1. Verifica en EasyPanel que las variables estén configuradas
2. Reinicia la aplicación después de agregar variables
3. Verifica los logs para ver el error exacto de Prisma

---

## 📝 NOTAS IMPORTANTES

1. **NUNCA** subas `.env` a GitHub
2. **SIEMPRE** verifica que las variables de entorno estén configuradas antes del deploy
3. El primer deploy puede tardar más (descarga de imágenes, instalación de dependencias)
4. Después del primer deploy, los siguientes serán más rápidos (caché de Docker)
5. Si cambias variables de entorno, **reinicia la aplicación** en EasyPanel

---

## 🎉 ¡LISTO!

Si llegaste hasta aquí y todo funciona, ¡felicidades! Tu CRM está desplegado en EasyPanel.

Para futuros deploys:
- Haz push a `main` y EasyPanel desplegará automáticamente (si tienes auto-deploy activado)
- O inicia un deploy manual desde el panel

---

**¿Problemas?** Revisa los logs en EasyPanel y esta guía. La mayoría de problemas son de configuración de variables de entorno o conexión a la BD.

