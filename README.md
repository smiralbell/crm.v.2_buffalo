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

### Worker (tareas automáticas)

Crea un **segundo servicio** en EasyPanel con la misma imagen y las mismas variables de entorno, sin puerto ni dominio, y con este comando:

```
npm run worker
```

Ejecuta la sincronización bancaria, Gmail, el motor del blog, los reintentos de webhooks, la cola de avisos, la conciliación automática, la vigilancia de integraciones y el briefing diario (lista completa en `lib/jobs/registry.ts`). Cada tarea se bloquea en Postgres, así que puede convivir con la web sin ejecutarse dos veces. Con el worker en marcha puedes poner `WEB_RUN_JOBS=0` en la web para que no las arranque también.

### Migraciones

- Los cambios de tablas nuevos van en `db/migrations/NNNN_nombre.sql`: numerados, idempotentes y sin editar los ya aplicados.
- Se aplican solos al arrancar el contenedor (`npm run db:migrate`), al arrancar el worker y desde **Sistema → Migraciones**. Quedan registrados en la tabla `schema_migrations`.
- `npm run db:migrate:status` muestra las pendientes.
- Los SQL antiguos de `prisma/` y `prisma/history/` son anteriores a este sistema y se consideran ya aplicados.

### Variables nuevas

| Variable | Para qué |
|---|---|
| `SESSION_SECRET` | **Obligatoria en producción.** Sin ella el login falla a propósito. |
| `CRON_SECRET` | Endpoints `/api/cron/*` (Bearer). |
| `INGEST_TOKEN` | Bearer para `POST /api/ingest/web_chat` (bot de n8n → ficha del contacto). |
| `CRM_ADMIN_WHATSAPP` | Número del admin de `.env` para avisos urgentes por WhatsApp. |
| `WEB_RUN_JOBS=0` | La web no ejecuta tareas (cuando ya hay worker). |
| `BRIEFING_HOUR` | Hora del briefing diario (por defecto 8, hora de Madrid). `DAILY_BRIEFING=0` lo apaga. |
| `AUTO_RECONCILE=0` | Desactiva la conciliación automática de cobros. |
| `AI_CALL_LOG=0` | Desactiva el registro de llamadas a la IA. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Enlace de pago en facturas. Webhook: `/api/webhooks/stripe`. Sin ellas el CRM queda listo y el botón lo indica. |
| `APP_BASE_URL` | URL pública del CRM (éxito/cancelación de Stripe). |
| `META_ADS_ACCESS_TOKEN` / `META_ADS_ACCOUNT_ID` | Gasto diario de Meta Ads (tarea `ads-sync`). |
| `GOOGLE_ADS_DEVELOPER_TOKEN` / `GOOGLE_ADS_CUSTOMER_ID` / `GOOGLE_ADS_REFRESH_TOKEN` | Gasto diario de Google Ads. El refresh token necesita el alcance `adwords`. |
| `WEBFORM_WEBHOOK_TOKEN` | `POST /api/webhooks/webform` — todas las webs Buffalo (`{ site, page, form }`). Ya no hace falta INSERT en Postgres. |
| `ONBOARDING_FORM_WEBHOOK_TOKEN` | Si no está, el webhook de onboarding queda abierto. Conviene ponerlo. |

El estado de todo esto (integraciones, tareas, webhooks, gasto de IA, migraciones y auditoría) se ve en **Sistema** (`/sistema`, solo admin).

### Notas Importantes

- **Base de datos:** La base de datos debe estar creada y accesible desde el contenedor
- **Prisma:** El Dockerfile genera Prisma Client automáticamente

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
- `npm run worker` - Tareas automáticas (ver «Worker»)
- `npm run db:migrate` / `npm run db:migrate:status` - Migraciones de `db/migrations`
- `npm test` - Tests (Vitest)

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

Las tablas se crean manualmente en PostgreSQL. Scripts SQL en `prisma/` (`CREATE_*.sql`, `ALTER_*.sql`).
Para levantar módulos concretos, ejecuta los scripts correspondientes (facturas, pipelines, coldcall, tickets, demos, etc.).

## 📄 Licencia

Privado - Uso interno Buffalo AI
