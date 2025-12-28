# CRM Buffalo

CRM interno profesional para gestión de contactos, leads, facturas y pipelines Kanban.

## 🚀 Inicio Rápido

### Requisitos Previos

- Node.js 20 o superior
- PostgreSQL 12 o superior
- npm o yarn

### Instalación Local

1. Clonar el repositorio:
```bash
git clone <repository-url>
cd "CRM V.2"
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:
```env
DATABASE_URL=postgresql://user:password@host:5432/database
SESSION_SECRET=your-secret-key-here
CRM_ADMIN_EMAIL=admin@buffalo.ai
CRM_ADMIN_PASSWORD=your-secure-password
NODE_ENV=development
PORT=3000
```

4. Generar Prisma Client:
```bash
npm run prisma:generate
```

5. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

6. Abrir [http://localhost:3000](http://localhost:3000)

## 📦 Deploy en EasyPanel

### Variables de Entorno Requeridas

Configura estas variables en EasyPanel:

- `DATABASE_URL` - URL completa de conexión PostgreSQL
- `CRM_ADMIN_EMAIL` - Email del administrador
- `CRM_ADMIN_PASSWORD` - Contraseña del administrador
- `SESSION_SECRET` - Secret para cookies (genera con: `openssl rand -base64 32`)
- `NODE_ENV=production`
- `PORT=3000`

### Configuración en EasyPanel

1. **Conectar repositorio GitHub**
2. **Tipo de aplicación:** Docker
3. **Puerto:** 3000
4. **Health Check:** `/api/health` (debe devolver 200)
5. **Build Command:** (automático desde Dockerfile)
6. **Start Command:** (automático desde Dockerfile)

### Notas Importantes

- **Base de datos:** La base de datos debe estar creada y accesible desde el contenedor
- **Tablas:** Las tablas se crean manualmente en PostgreSQL (ver SQL en `prisma/`)
- **Prisma:** El Dockerfile genera Prisma Client automáticamente, no ejecuta migraciones

## 🏗️ Estructura del Proyecto

```
CRM V.2/
├── pages/              # Páginas Next.js (Pages Router)
│   ├── api/           # API Routes
│   ├── dashboard.tsx  # Dashboard principal
│   ├── contacts/      # Gestión de contactos
│   ├── leads/         # Gestión de leads
│   ├── invoices/      # Sistema de facturas
│   └── pipelines/     # Pipelines Kanban
├── components/         # Componentes React
├── lib/                # Utilidades (auth, prisma, utils)
├── prisma/             # Schema Prisma y SQL scripts
├── styles/             # Estilos globales
└── templates/          # Plantillas HTML
```

## 📝 Scripts Disponibles

- `npm run dev` - Servidor de desarrollo
- `npm run build` - Build para producción
- `npm start` - Servidor de producción
- `npm run lint` - Ejecuta ESLint
- `npm run prisma:generate` - Genera Prisma Client
- `npm run prisma:studio` - Abre Prisma Studio

## 🔐 Autenticación

Sistema de autenticación simple basado en variables de entorno:
- Email: `CRM_ADMIN_EMAIL`
- Password: `CRM_ADMIN_PASSWORD`
- Sesiones gestionadas con cookies firmadas

## 📊 Funcionalidades

- **Dashboard:** Métricas, gráficos y actividad reciente
- **Contactos:** CRUD completo de contactos
- **Leads:** CRUD completo de leads con estados y valores
- **Facturas:** Sistema de facturación con generación de PDF
- **Pipelines:** Tableros Kanban para gestión de oportunidades

## 🗄️ Base de Datos

Las tablas se crean manualmente en PostgreSQL. Scripts SQL disponibles en:
- `prisma/CREATE_INVOICES_TABLE.sql` - Tablas de facturas
- `prisma/CREATE_PIPELINES_TABLES.sql` - Tablas de pipelines
- `prisma/ADD_CARD_FIELDS.sql` - Campos adicionales de tarjetas

## 📄 Licencia

Privado - Uso interno Buffalo AI
