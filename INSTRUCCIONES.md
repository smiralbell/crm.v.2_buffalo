# 📋 Instrucciones para Visualizar el CRM Buffalo

## 🚀 Pasos para Ejecutar el CRM Localmente

### 1. Instalar Dependencias

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
npm install
```

### 2. Configurar Base de Datos PostgreSQL

Asegúrate de tener PostgreSQL instalado y ejecutándose. Luego:

1. Crea una base de datos:
```sql
CREATE DATABASE crm_buffalo;
```

2. Crea un archivo `.env` en la raíz del proyecto (copia de `.env.example`):
```bash
cp .env.example .env
```

3. Edita el archivo `.env` con tus credenciales:
```
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/crm_buffalo
SESSION_SECRET=tu-secret-key-aqui-cambiar-en-produccion
NODE_ENV=development
PORT=3000
```

**Nota**: Reemplaza `tu_password` con tu contraseña de PostgreSQL y `tu-secret-key-aqui` con una cadena aleatoria segura.

### 3. Configurar Prisma y Base de Datos

Ejecuta los siguientes comandos en orden:

```bash
# Generar Prisma Client
npm run prisma:generate

# Crear las tablas en la base de datos
npm run prisma:migrate

# Crear el usuario inicial (admin@buffalo.ai / admin123)
npm run prisma:seed
```

### 4. Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

### 5. Abrir en el Navegador

Abre tu navegador y ve a:
```
http://localhost:3000
```

### 6. Iniciar Sesión

Usa las credenciales por defecto:
- **Email**: `admin@buffalo.ai`
- **Password**: `admin123`

## 🎯 Funcionalidades Disponibles

Una vez que inicies sesión, podrás:

1. **Dashboard**: Ver métricas, gráficos y actividad reciente
2. **Contactos**: Crear, editar, eliminar y buscar contactos
3. **Leads**: Gestionar leads con estados (nuevo, en proceso, cerrado, perdido)

## 🐳 Ejecutar con Docker (Opcional)

Si prefieres usar Docker:

### 1. Build de la imagen

```bash
docker build -t crm-buffalo .
```

### 2. Ejecutar contenedor

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:password@host.docker.internal:5432/crm_buffalo \
  -e SESSION_SECRET=your-secret-key \
  -e NODE_ENV=production \
  -e PORT=3000 \
  crm-buffalo
```

**Nota**: Asegúrate de que PostgreSQL esté accesible desde el contenedor Docker.

## 🔧 Solución de Problemas

### Error: "Cannot connect to database"

- Verifica que PostgreSQL esté ejecutándose
- Verifica que la URL en `.env` sea correcta
- Verifica que la base de datos `crm_buffalo` exista

### Error: "Prisma Client not generated"

Ejecuta:
```bash
npm run prisma:generate
```

### Error: "No migrations found"

Ejecuta:
```bash
npm run prisma:migrate
```

### Error: "Port 3000 already in use"

Cambia el puerto en `.env`:
```
PORT=3001
```

Y luego accede a `http://localhost:3001`

## 📝 Comandos Útiles

- `npm run dev` - Inicia servidor de desarrollo
- `npm run build` - Construye para producción
- `npm start` - Inicia servidor de producción
- `npm run prisma:studio` - Abre Prisma Studio (interfaz visual de BD)
- `npm run lint` - Verifica errores de código

## 🎨 Personalización

El diseño está basado en shadcn/ui y TailwindCSS. Puedes modificar los estilos en:
- `styles/globals.css` - Estilos globales
- `tailwind.config.js` - Configuración de Tailwind
- Componentes en `components/ui/` - Componentes base

## ✅ Checklist de Verificación

Antes de usar el CRM, asegúrate de:

- [ ] PostgreSQL está instalado y ejecutándose
- [ ] Base de datos `crm_buffalo` está creada
- [ ] Archivo `.env` está configurado correctamente
- [ ] Dependencias instaladas (`npm install`)
- [ ] Prisma Client generado (`npm run prisma:generate`)
- [ ] Migraciones ejecutadas (`npm run prisma:migrate`)
- [ ] Usuario inicial creado (`npm run prisma:seed`)
- [ ] Servidor iniciado (`npm run dev`)

## 🚀 Listo para Usar

Una vez completados todos los pasos, tu CRM estará listo para usar. ¡Disfruta gestionando tus contactos y leads!

