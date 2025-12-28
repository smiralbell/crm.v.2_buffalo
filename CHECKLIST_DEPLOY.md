# ✅ Checklist de Deploy - CRM Buffalo

Usa este checklist para asegurarte de que el deploy funcione a la primera.

---

## 📦 ANTES DE SUBIR A GITHUB

### Verificación del Proyecto

- [ ] **Next.js Pages Router confirmado**
  - [ ] Existe carpeta `pages/` (no `app/`)
  - [ ] NO existe `middleware.ts` en la raíz
  - [ ] `next.config.js` NO tiene `output: "standalone"`

- [ ] **Dockerfile verificado**
  - [ ] Usa `node:20-alpine`
  - [ ] Instala `openssl`
  - [ ] Ejecuta `npm ci`
  - [ ] Ejecuta `npx prisma generate`
  - [ ] Ejecuta `npm run build`
  - [ ] Expone puerto `3000`
  - [ ] Usa `CMD ["npm", "start"]`

- [ ] **Archivos de configuración**
  - [ ] `.gitignore` incluye `.env`, `node_modules`, `.next`
  - [ ] `.dockerignore` está presente
  - [ ] `package.json` tiene todos los scripts necesarios
  - [ ] `tsconfig.json` tiene `paths: { "@/*": ["./*"] }`

- [ ] **Health Check**
  - [ ] Existe `pages/api/health.ts`
  - [ ] Verifica conexión a BD
  - [ ] Retorna 200 si OK, 500 si error

### Preparación para Git

- [ ] **Archivos sensibles**
  - [ ] `.env` NO está en el repositorio
  - [ ] `.env.local` NO está en el repositorio
  - [ ] `node_modules/` NO está en el repositorio
  - [ ] `.next/` NO está en el repositorio

- [ ] **Archivos necesarios**
  - [ ] `Dockerfile` está presente
  - [ ] `.dockerignore` está presente
  - [ ] `.gitignore` está presente
  - [ ] `package.json` está presente
  - [ ] `package-lock.json` está presente
  - [ ] `prisma/schema.prisma` está presente

- [ ] **Git configurado**
  - [ ] Repositorio inicializado (`git init`)
  - [ ] Remote agregado (`git remote add origin ...`)
  - [ ] Branch `main` creado
  - [ ] Primer commit realizado

---

## 🚀 ANTES DEL DEPLOY EN EASYPANEL

### Repositorio GitHub

- [ ] **Código subido**
  - [ ] Código está en GitHub
  - [ ] Branch `main` (o `master`) está actualizado
  - [ ] Último commit incluye todos los cambios necesarios

- [ ] **Verificación en GitHub**
  - [ ] `.env` NO aparece en el repositorio
  - [ ] `Dockerfile` está visible
  - [ ] `.gitignore` está presente
  - [ ] `package.json` y `package-lock.json` están presentes

### Base de Datos

- [ ] **PostgreSQL configurado**
  - [ ] Base de datos creada
  - [ ] Usuario y contraseña configurados
  - [ ] URL de conexión anotada
  - [ ] Accesible desde el servidor de EasyPanel

- [ ] **Schema de Prisma**
  - [ ] `prisma/schema.prisma` está actualizado
  - [ ] Todas las tablas necesarias están definidas
  - [ ] Migraciones listas (si las usas)

### Variables de Entorno Preparadas

- [ ] **DATABASE_URL**
  - [ ] URL completa anotada
  - [ ] Formato correcto: `postgresql://user:pass@host:port/db`
  - [ ] Caracteres especiales URL-encoded si es necesario

- [ ] **CRM_ADMIN_EMAIL**
  - [ ] Email del administrador definido
  - [ ] Formato válido de email

- [ ] **CRM_ADMIN_PASSWORD**
  - [ ] Contraseña segura definida
  - [ ] Anotada en lugar seguro (no en código)

- [ ] **SESSION_SECRET**
  - [ ] Generado con `openssl rand -base64 32`
  - [ ] Anotado en lugar seguro

- [ ] **NODE_ENV**
  - [ ] Valor: `production`

- [ ] **PORT**
  - [ ] Valor: `3000` (o el que uses)

---

## 🎯 DURANTE EL DEPLOY EN EASYPANEL

### Configuración Inicial

- [ ] **Repositorio conectado**
  - [ ] GitHub autorizado en EasyPanel
  - [ ] Repositorio seleccionado
  - [ ] Branch `main` seleccionado

- [ ] **Tipo de aplicación**
  - [ ] Tipo: "Docker" o "Custom"
  - [ ] Dockerfile detectado automáticamente
  - [ ] Build context: `.` (raíz)

### Variables de Entorno Configuradas

- [ ] `DATABASE_URL` agregada con valor correcto
- [ ] `CRM_ADMIN_EMAIL` agregada
- [ ] `CRM_ADMIN_PASSWORD` agregada
- [ ] `SESSION_SECRET` agregada
- [ ] `NODE_ENV` = `production`
- [ ] `PORT` = `3000`

**Verificación:**
- [ ] Todas las variables tienen valores (no están vacías)
- [ ] No hay espacios alrededor del `=`
- [ ] `DATABASE_URL` es accesible desde el servidor

### Configuración de Puerto

- [ ] Puerto interno: `3000`
- [ ] Puerto externo: Configurado (o automático)

### Health Check (Opcional pero Recomendado)

- [ ] Path: `/api/health`
- [ ] Expected Status: `200`
- [ ] Interval: `30` segundos

### Inicio del Deploy

- [ ] Build iniciado
- [ ] Logs visibles
- [ ] No hay errores en los primeros pasos

---

## ✅ DESPUÉS DEL DEPLOY

### Verificación Inmediata

- [ ] **Build completado**
  - [ ] Build terminó sin errores
  - [ ] Mensaje "Build successful" o similar
  - [ ] Tiempo de build razonable (5-10 min)

- [ ] **Aplicación corriendo**
  - [ ] Estado: "Running" o "Activa"
  - [ ] Logs muestran: "Ready in X ms"
  - [ ] No hay errores en los logs

### Verificación de Health Check

- [ ] **Endpoint accesible**
  - [ ] URL: `https://tu-dominio/api/health`
  - [ ] Responde con status 200
  - [ ] JSON muestra: `"status": "ok"`, `"database": "connected"`

**Si falla:**
- [ ] Revisar logs de la aplicación
- [ ] Verificar `DATABASE_URL`
- [ ] Verificar que la BD esté accesible

### Verificación de la Aplicación

- [ ] **Página de login accesible**
  - [ ] URL principal carga correctamente
  - [ ] Muestra página de login
  - [ ] No hay errores en consola del navegador

- [ ] **Login funcional**
  - [ ] Puedo iniciar sesión con `CRM_ADMIN_EMAIL` y `CRM_ADMIN_PASSWORD`
  - [ ] Redirige al dashboard después del login
  - [ ] No hay errores de autenticación

- [ ] **Dashboard funcional**
  - [ ] Dashboard carga correctamente
  - [ ] Muestra estadísticas
  - [ ] Gráficos se renderizan
  - [ ] No hay errores en consola

### Verificación de Base de Datos

- [ ] **Conexión establecida**
  - [ ] Health check muestra `"database": "connected"`
  - [ ] No hay errores de conexión en logs

- [ ] **Tablas creadas** (si es primera vez)
  - [ ] Tablas existen en la BD
  - [ ] O migraciones ejecutadas correctamente

### Verificación Final

- [ ] **Funcionalidades básicas**
  - [ ] Puedo ver contactos (si hay datos)
  - [ ] Puedo ver leads (si hay datos)
  - [ ] Puedo crear un contacto nuevo
  - [ ] Puedo crear un lead nuevo
  - [ ] No hay errores 500 en la consola

- [ ] **Performance**
  - [ ] Páginas cargan en tiempo razonable (< 3 seg)
  - [ ] No hay timeouts
  - [ ] Health check responde rápido

---

## 🔄 PARA FUTUROS DEPLOYS

### Antes de cada deploy

- [ ] Cambios probados localmente
- [ ] Variables de entorno actualizadas (si cambió algo)
- [ ] Código subido a GitHub
- [ ] Build local funciona (`npm run build`)

### Después de cada deploy

- [ ] Health check OK
- [ ] Login funciona
- [ ] Funcionalidades críticas verificadas
- [ ] Logs sin errores críticos

---

## 🆘 SI ALGO FALLA

### Checklist de Debugging

1. **Revisar logs en EasyPanel**
   - [ ] Logs de build
   - [ ] Logs de aplicación
   - [ ] Buscar palabras clave: "error", "failed", "cannot"

2. **Verificar variables de entorno**
   - [ ] Todas las variables están configuradas
   - [ ] Valores son correctos
   - [ ] No hay espacios extra

3. **Verificar base de datos**
   - [ ] BD está corriendo
   - [ ] `DATABASE_URL` es correcta
   - [ ] BD es accesible desde el servidor

4. **Verificar código**
   - [ ] Último commit en GitHub
   - [ ] Branch correcto seleccionado
   - [ ] Dockerfile sin errores

5. **Reiniciar aplicación**
   - [ ] Reiniciar desde EasyPanel
   - [ ] Verificar logs después del reinicio

---

## 📝 NOTAS

- Guarda este checklist y úsalo en cada deploy
- Marca cada item antes de continuar
- Si algo falla, vuelve al checklist y verifica paso a paso
- La mayoría de problemas son de configuración de variables o BD

---

**✅ Si todos los items están marcados, tu deploy debería funcionar perfectamente.**

