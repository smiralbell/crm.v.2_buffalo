# 📤 Comandos Git para Subir a GitHub

Esta guía te muestra **exactamente** qué comandos ejecutar para subir tu proyecto a GitHub.

---

## 🎯 OBJETIVO

Subir el proyecto CRM Buffalo a GitHub de forma segura, asegurándote de que:
- ✅ Archivos sensibles NO se suban
- ✅ Todos los archivos necesarios SÍ se suban
- ✅ El repositorio esté listo para EasyPanel

---

## 📋 PASO A PASO

### Paso 1: Verificar Estado Actual

```bash
# Ver qué archivos están en el repositorio
git status
```

**Qué buscar:**
- ❌ Si ves `.env` en la lista, **NO lo agregues**
- ✅ Si ves `Dockerfile`, `.gitignore`, etc., está bien

---

### Paso 2: Inicializar Git (Si No Está Inicializado)

```bash
# Solo si NO has inicializado Git antes
git init
```

**Verificación:**
```bash
# Deberías ver: "Initialized empty Git repository"
```

---

### Paso 3: Verificar .gitignore

```bash
# Verificar que .gitignore existe y tiene el contenido correcto
cat .gitignore
```

**Debe incluir:**
- `.env`
- `node_modules/`
- `.next/`
- `*.log`

Si no existe o está incompleto, ya está actualizado en el proyecto.

---

### Paso 4: Agregar Archivos al Staging

```bash
# Agregar todos los archivos (excepto los del .gitignore)
git add .
```

**Verificación:**
```bash
# Ver qué archivos se agregaron
git status
```

**IMPORTANTE:** 
- ✅ Debe aparecer `Dockerfile`, `.gitignore`, `package.json`, etc.
- ❌ NO debe aparecer `.env`
- ❌ NO debe aparecer `node_modules/`

---

### Paso 5: Hacer el Primer Commit

```bash
# Commit inicial
git commit -m "Initial commit: CRM Buffalo ready for EasyPanel"
```

**Verificación:**
```bash
# Deberías ver: "1 file changed" o similar
git log --oneline
```

---

### Paso 6: Crear Repositorio en GitHub

1. Ve a [GitHub.com](https://github.com)
2. Haz clic en **"New repository"** o **"+"** → **"New repository"**
3. Nombre: `crm-buffalo` (o el que prefieras)
4. Descripción: "CRM Buffalo - Next.js CRM for EasyPanel"
5. **NO** marques "Initialize with README" (ya tienes uno)
6. **NO** marques "Add .gitignore" (ya tienes uno)
7. Haz clic en **"Create repository"**

---

### Paso 7: Conectar con GitHub

**Opción A: HTTPS (Más Fácil)**

```bash
# Reemplaza USERNAME y REPO_NAME con tus valores
git remote add origin https://github.com/USERNAME/REPO_NAME.git

# Ejemplo:
# git remote add origin https://github.com/tu-usuario/crm-buffalo.git
```

**Opción B: SSH (Si Tienes SSH Configurado)**

```bash
# Reemplaza USERNAME y REPO_NAME con tus valores
git remote add origin git@github.com:USERNAME/REPO_NAME.git

# Ejemplo:
# git remote add origin git@github.com:tu-usuario/crm-buffalo.git
```

**Verificación:**
```bash
# Verificar que el remote se agregó correctamente
git remote -v
```

**Deberías ver:**
```
origin  https://github.com/USERNAME/REPO_NAME.git (fetch)
origin  https://github.com/USERNAME/REPO_NAME.git (push)
```

---

### Paso 8: Cambiar a Branch Main (Si Estás en Otra)

```bash
# Cambiar a branch main (o master si prefieres)
git branch -M main
```

**Verificación:**
```bash
# Ver en qué branch estás
git branch
```

**Deberías ver:**
```
* main
```

---

### Paso 9: Subir Código a GitHub

```bash
# Subir código a GitHub
git push -u origin main
```

**Si es la primera vez:**
- GitHub te pedirá autenticación
- Usa tu usuario y contraseña (o token de acceso personal)
- Si usas SSH, puede pedirte la passphrase de tu clave

**Verificación:**
- Ve a tu repositorio en GitHub
- Deberías ver todos los archivos
- **NO** debe aparecer `.env`
- **SÍ** debe aparecer `Dockerfile`, `.gitignore`, etc.

---

## ✅ VERIFICACIÓN FINAL EN GITHUB

Abre tu repositorio en GitHub y verifica:

### Archivos que DEBEN estar:
- ✅ `Dockerfile`
- ✅ `.gitignore`
- ✅ `.dockerignore`
- ✅ `package.json`
- ✅ `package-lock.json`
- ✅ `next.config.js`
- ✅ `tsconfig.json`
- ✅ `prisma/schema.prisma`
- ✅ `pages/` (carpeta completa)
- ✅ `components/` (carpeta completa)
- ✅ `lib/` (carpeta completa)
- ✅ `README.md`

### Archivos que NO deben estar:
- ❌ `.env`
- ❌ `.env.local`
- ❌ `node_modules/`
- ❌ `.next/`
- ❌ `*.log`

---

## 🔄 PARA FUTUROS CAMBIOS

Después del primer push, para subir cambios:

```bash
# 1. Ver qué cambió
git status

# 2. Agregar cambios
git add .

# 3. Hacer commit
git commit -m "Descripción de los cambios"

# 4. Subir a GitHub
git push
```

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### Error: "remote origin already exists"

```bash
# Eliminar el remote existente
git remote remove origin

# Agregar el correcto
git remote add origin https://github.com/USERNAME/REPO_NAME.git
```

### Error: "failed to push some refs"

```bash
# Si GitHub tiene archivos que tú no tienes (README, .gitignore inicial)
git pull origin main --allow-unrelated-histories

# Resolver conflictos si los hay, luego:
git push -u origin main
```

### Error: "authentication failed"

**HTTPS:**
- Usa un [Personal Access Token](https://github.com/settings/tokens) en lugar de contraseña
- O configura SSH

**SSH:**
- Verifica que tu clave SSH esté agregada a GitHub
- `ssh -T git@github.com` para probar

### Archivo .env se subió por error

```bash
# Eliminar del repositorio (NO del disco)
git rm --cached .env

# Hacer commit
git commit -m "Remove .env from repository"

# Subir cambio
git push
```

**IMPORTANTE:** Si ya subiste `.env` a GitHub:
1. Elimínalo del repositorio (comando arriba)
2. **CAMBIA todas las contraseñas y secrets** que estaban en ese archivo
3. Considera que esos valores están comprometidos

---

## 📝 BUENAS PRÁCTICAS

1. **Nunca subas `.env`**
   - Verifica siempre con `git status` antes de `git add`
   - Si aparece `.env`, NO lo agregues

2. **Commits descriptivos**
   - Usa mensajes claros: "Add Dockerfile", "Fix health check", etc.
   - Evita: "fix", "update", "changes"

3. **Branch main/master**
   - Usa `main` como branch principal (estándar moderno)
   - O `master` si tu organización lo prefiere

4. **Verificar antes de push**
   - Siempre revisa `git status` antes de hacer commit
   - Verifica que no haya archivos sensibles

---

## ✅ CHECKLIST

Antes de continuar con EasyPanel, verifica:

- [ ] Git inicializado
- [ ] `.gitignore` presente y correcto
- [ ] `.env` NO está en el repositorio
- [ ] Primer commit realizado
- [ ] Repositorio creado en GitHub
- [ ] Remote agregado correctamente
- [ ] Código subido a GitHub
- [ ] Verificación en GitHub: archivos correctos presentes
- [ ] Verificación en GitHub: archivos sensibles ausentes

---

**✅ Si todos los items están marcados, estás listo para conectar con EasyPanel.**

