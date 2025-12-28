# CRM Buffalo

CRM interno, minimalista y profesional, diseñado para gestionar contactos y leads de manera simple y efectiva.

## 🚀 Inicio Rápido

### Requisitos Previos

- Node.js 20 o superior
- PostgreSQL 12 o superior
- npm o yarn

### Instalación

1. Clonar el repositorio
2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
```

Editar `.env` con tus credenciales de base de datos:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/crm_buffalo
SESSION_SECRET=your-secret-key-here
NODE_ENV=development
PORT=3000
```

4. Configurar la base de datos:
```bash
# Generar Prisma Client
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate

# Crear usuario inicial
npm run prisma:seed
```

5. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

6. Abrir [http://localhost:3000](http://localhost:3000)

### Credenciales por Defecto

- Email: `admin@buffalo.ai`
- Password: `admin123`

## 📦 Deploy con Docker

### Build de la imagen

```bash
docker build -t crm-buffalo .
```

### Ejecutar contenedor

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:password@host:5432/database \
  -e SESSION_SECRET=your-secret-key \
  -e NODE_ENV=production \
  -e PORT=3000 \
  crm-buffalo
```

## 🏗️ Estructura del Proyecto

```
crm-buffalo/
├── pages/              # Páginas Next.js (Pages Router)
├── components/         # Componentes React
├── lib/                # Utilidades (auth, prisma, etc.)
├── prisma/             # Schema y migraciones
├── styles/             # Estilos globales
└── public/             # Assets estáticos
```

## 📝 Scripts Disponibles

- `npm run dev` - Inicia servidor de desarrollo
- `npm run build` - Construye para producción
- `npm start` - Inicia servidor de producción
- `npm run lint` - Ejecuta ESLint
- `npm run prisma:generate` - Genera Prisma Client
- `npm run prisma:migrate` - Ejecuta migraciones
- `npm run prisma:studio` - Abre Prisma Studio
- `npm run prisma:seed` - Ejecuta seed de base de datos

## 🔐 Autenticación

El sistema usa autenticación basada en cookies y sesiones almacenadas en base de datos. Las sesiones expiran después de 7 días.

## 📊 Funcionalidades

- **Dashboard**: Métricas, gráficos y actividad reciente
- **Contactos**: CRUD completo de contactos
- **Leads**: CRUD completo de leads con estados y valores
- **Relaciones**: Leads asociados a contactos

## 🐳 Deploy en EasyPanel

Para una guía completa paso a paso, consulta **[DEPLOY_EASYPANEL.md](./DEPLOY_EASYPANEL.md)**

### Resumen rápido:

1. **Preparar para GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/USERNAME/REPO.git
   git push -u origin main
   ```

2. **Variables de entorno en EasyPanel:**
   - `DATABASE_URL` - URL de conexión PostgreSQL
   - `CRM_ADMIN_EMAIL` - Email del administrador
   - `CRM_ADMIN_PASSWORD` - Contraseña del administrador
   - `SESSION_SECRET` - Secret para cookies (genera con `openssl rand -base64 32`)
   - `NODE_ENV=production`
   - `PORT=3000`

3. **Configurar en EasyPanel:**
   - Conectar repositorio GitHub
   - Tipo: Docker
   - Puerto: 3000
   - Health Check: `/api/health` (status 200)

4. **Verificar:**
   - Health check: `https://tu-dominio/api/health`
   - Login con credenciales configuradas

**📋 Usa el [CHECKLIST_DEPLOY.md](./CHECKLIST_DEPLOY.md) para asegurar un deploy sin errores.**

## 📄 Licencia

Privado - Uso interno

