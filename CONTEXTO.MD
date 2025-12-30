# CRM Buffalo - Especificación Técnica Completa

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Por Qué Rehacer Desde Cero](#por-qué-rehacer-desde-cero)
3. [Principios de Diseño](#principios-de-diseño)
4. [Arquitectura Propuesta](#arquitectura-propuesta)
5. [Estructura de Carpetas](#estructura-de-carpetas)
6. [Diseño y Estilos](#diseño-y-estilos)
7. [Funcionalidades del CRM](#funcionalidades-del-crm)
8. [Flujo de Autenticación](#flujo-de-autenticación)
9. [Base de Datos](#base-de-datos)
10. [Variables de Entorno](#variables-de-entorno)
11. [Deploy en EasyPanel](#deploy-en-easypanel)
12. [Checklist de Implementación](#checklist-de-implementación)

---

## 🎯 Visión General

### ¿Qué es CRM Buffalo?

CRM Buffalo es un CRM interno, minimalista y profesional, diseñado para gestionar contactos y leads de manera simple y efectiva. Es una aplicación de un solo usuario, sin complejidades de multi-tenancy, enfocada en la estabilidad y facilidad de mantenimiento.

### Objetivos Principales

- **Estabilidad**: Funciona siempre, sin sorpresas
- **Simplicidad**: Código claro y predecible
- **Deployabilidad**: Se despliega en EasyPanel sin hacks
- **Mantenibilidad**: Cualquier desarrollador puede entenderlo y modificarlo

### Stack Tecnológico

- **Framework**: Next.js Pages Router (NO App Router)
- **Lenguaje**: TypeScript
- **Estilos**: TailwindCSS + shadcn/ui
- **Base de Datos**: PostgreSQL
- **ORM**: Prisma
- **Autenticación**: Cookies + sesiones en BD
- **Deploy**: Docker + EasyPanel

---

## 🔄 Por Qué Rehacer Desde Cero

### Problemas del Proyecto Actual

1. **Next.js App Router**: Layouts automáticos causan comportamientos impredecibles en producción
2. **Middleware complejo**: Lógica de auth distribuida y difícil de debuggear
3. **Redirecciones implícitas**: El framework decide cuándo redirigir, no el desarrollador
4. **Layouts anidados**: Herencia de layouts causa problemas de renderizado
5. **Standalone mode**: Comportamientos diferentes entre desarrollo y producción

### Ventajas del Nuevo Enfoque

1. **Pages Router**: Comportamiento predecible, sin magia
2. **Auth explícita**: Cada página decide si requiere autenticación
3. **Layout manual**: Control total sobre qué se renderiza dónde
4. **Docker simple**: Un solo contenedor, sin optimizaciones complejas
5. **Debugging fácil**: Todo es visible y trazable

---

## 🎨 Principios de Diseño

### Principios Técnicos

1. **Explicitud sobre Implicitud**: Todo debe ser visible en el código
2. **Simplicidad sobre Elegancia**: Código simple es mejor que código "inteligente"
3. **Estabilidad sobre Features**: Preferir estabilidad a nuevas funcionalidades
4. **Debugging sobre Performance**: Logs claros son más importantes que micro-optimizaciones
5. **Deployabilidad sobre Arquitectura**: Si no se puede desplegar fácilmente, no sirve

### Principios Visuales

1. **Consistencia**: Mantener exactamente el diseño actual (tipo Holded)
2. **Minimalismo**: Interfaz limpia, sin elementos innecesarios
3. **Profesionalismo**: Look & feel corporativo y serio
4. **Usabilidad**: Navegación clara y predecible

---

## 🏗️ Arquitectura Propuesta

### Arquitectura General

```
┌─────────────────────────────────────────┐
│         Browser (Usuario)                │
└──────────────┬──────────────────────────┘
               │
               │ HTTP Requests
               │
┌──────────────▼──────────────────────────┐
│      Next.js Pages Router               │
│  ┌──────────────────────────────────┐   │
│  │  Public Pages (/login)           │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  Protected Pages (/dashboard)    │   │
│  │  - requireAuth() check           │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  API Routes (/api/*)              │   │
│  │  - requireAuth() check           │   │
│  └──────────────────────────────────┘   │
└──────────────┬──────────────────────────┘
               │
               │ Prisma Client
               │
┌──────────────▼──────────────────────────┐
│         PostgreSQL Database              │
└─────────────────────────────────────────┘
```

### Flujo de Request

1. Usuario hace request a `/dashboard`
2. Página ejecuta `requireAuth()` al inicio
3. `requireAuth()` verifica cookie de sesión
4. Si no hay sesión → redirect a `/login`
5. Si hay sesión → renderiza página normalmente
6. Layout visual se aplica manualmente en cada página

### Sin Middleware

- **NO** hay middleware.ts
- **NO** hay lógica global de routing
- **NO** hay redirecciones automáticas
- **TODO** es explícito en cada página

---

## 📁 Estructura de Carpetas

```
crm-buffalo/
├── pages/
│   ├── _app.tsx                 # Configuración global Next.js
│   ├── _document.tsx            # HTML custom (opcional)
│   ├── index.tsx                # Redirect a /login o /dashboard
│   ├── login.tsx                # Página de login (pública)
│   ├── dashboard.tsx            # Dashboard (protegida)
│   ├── contacts/
│   │   ├── index.tsx            # Lista de contactos
│   │   └── [id].tsx            # Detalle/edición contacto
│   ├── leads/
│   │   ├── index.tsx            # Lista de leads
│   │   └── [id].tsx            # Detalle/edición lead
│   └── api/
│       ├── auth/
│       │   ├── login.ts        # POST /api/auth/login
│       │   └── logout.ts      # POST /api/auth/logout
│       ├── contacts/
│       │   ├── index.ts        # GET/POST /api/contacts
│       │   └── [id].ts        # GET/PUT/DELETE /api/contacts/[id]
│       └── leads/
│           ├── index.ts        # GET/POST /api/leads
│           └── [id].ts        # GET/PUT/DELETE /api/leads/[id]
│
├── components/
│   ├── Layout.tsx              # Layout principal (Sidebar + contenido)
│   ├── Sidebar.tsx             # Componente Sidebar
│   ├── Dashboard/
│   │   ├── StatsCard.tsx
│   │   └── Charts.tsx
│   ├── Contacts/
│   │   ├── ContactList.tsx
│   │   ├── ContactForm.tsx
│   │   └── ContactCard.tsx
│   ├── Leads/
│   │   ├── LeadList.tsx
│   │   ├── LeadForm.tsx
│   │   └── LeadCard.tsx
│   └── ui/                     # Componentes shadcn/ui
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── ...
│
├── lib/
│   ├── auth.ts                 # Funciones de autenticación
│   │   ├── requireAuth()
│   │   ├── createSession()
│   │   ├── getSession()
│   │   └── deleteSession()
│   ├── prisma.ts               # Prisma Client singleton
│   └── utils.ts                # Utilidades generales
│
├── prisma/
│   ├── schema.prisma           # Schema de base de datos
│   └── migrations/             # Migraciones
│
├── styles/
│   └── globals.css             # Estilos globales + Tailwind
│
├── public/                     # Assets estáticos
│
├── Dockerfile                  # Docker simple
├── .dockerignore
├── .env.example
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### Explicación de Carpetas Clave

- **pages/**: Todas las rutas de Next.js Pages Router
- **pages/api/**: API Routes para operaciones CRUD
- **components/**: Componentes React reutilizables
- **lib/**: Utilidades y helpers (auth, prisma, etc.)
- **prisma/**: Schema y migraciones de base de datos

---

## 🎨 Diseño y Estilos

### Estructura Visual General

El diseño mantiene **exactamente** el look & feel actual tipo Holded:

```
┌─────────────────────────────────────────────┐
│  ┌──────────┐  ┌─────────────────────────┐ │
│  │          │  │                         │ │
│  │ Sidebar  │  │    Contenido Principal  │ │
│  │          │  │                         │ │
│  │ - Logo   │  │    (Páginas dinámicas)  │ │
│  │ - Nav    │  │                         │ │
│  │ - Menu   │  │                         │ │
│  │          │  │                         │ │
│  └──────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Sidebar

**Contenido**:
- Logo "CRM Buffalo" (arriba)
- Menú de navegación:
  - Dashboard
  - Contacts
  - Leads
  - Settings (opcional)
- Estilo: Fondo claro, bordes sutiles, tipografía limpia

**Aplicación Manual**:
- El componente `<Layout>` envuelve el contenido
- `<Layout>` incluye `<Sidebar>` + área de contenido
- Cada página protegida usa `<Layout>` explícitamente

### Layout Visual por Tipo de Página

**Páginas Públicas** (login):
- Sin Sidebar
- Centrado vertical y horizontal
- Card de login centrado

**Páginas Protegidas** (dashboard, contacts, leads):
- Con Sidebar (aplicado manualmente)
- Contenido a la derecha del Sidebar
- Header de página con título
- Contenido scrollable

### Componentes UI Reutilizables

Se mantienen **exactamente** los mismos componentes shadcn/ui:
- Button, Card, Input, Label, Dialog, Select, etc.
- Mismos colores, mismos estilos, misma tipografía
- Mismo sistema de diseño

### Principios de Diseño Visual

1. **Espaciado**: Consistente, usando sistema de spacing de Tailwind
2. **Jerarquía**: Títulos claros, subtítulos, contenido bien organizado
3. **Minimalismo**: Sin elementos decorativos innecesarios
4. **Colores**: Paleta neutra, profesional, tipo Holded
5. **Tipografía**: Inter font, tamaños consistentes

### Cómo Aplicar Layout en Pages Router

**Ejemplo página protegida**:
```typescript
// pages/dashboard.tsx
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'

export async function getServerSideProps(context) {
  await requireAuth(context) // Verifica auth
  return { props: {} }
}

export default function Dashboard() {
  return (
    <Layout>  {/* Layout manual con Sidebar */}
      <h1>Dashboard</h1>
      {/* Contenido */}
    </Layout>
  )
}
```

**Ejemplo página pública**:
```typescript
// pages/login.tsx
export default function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {/* Sin Layout, sin Sidebar */}
      <Card>Login form</Card>
    </div>
  )
}
```

---

## 📊 Funcionalidades del CRM

### 1. Login

**Qué hace**:
- Permite autenticarse con email y password
- Crea sesión en base de datos
- Establece cookie `session_id`
- Redirige a `/dashboard` tras login exitoso

**Qué valida**:
- Email válido (formato)
- Password no vacío
- Credenciales coinciden con usuario en BD

**Qué guarda**:
- Sesión en tabla `sessions`:
  - `id`: UUID
  - `user_id`: FK a users
  - `token`: Token único
  - `expires_at`: Fecha de expiración
  - `created_at`: Timestamp

**Flujo**:
1. Usuario ingresa email + password
2. POST a `/api/auth/login`
3. API valida credenciales
4. Si válido: crea sesión, setea cookie, retorna success
5. Frontend redirige a `/dashboard`

### 2. Dashboard

**Qué métricas muestra**:
- Total de contactos
- Total de leads
- Leads por estado (nuevo, en proceso, cerrado, perdido)
- Valor total de leads (suma de `valor` campo)
- Actividad reciente (últimos 10 leads/contactos creados)

**Qué datos consulta**:
- `SELECT COUNT(*) FROM contacts`
- `SELECT COUNT(*) FROM leads`
- `SELECT estado, COUNT(*) FROM leads GROUP BY estado`
- `SELECT SUM(valor) FROM leads`
- `SELECT * FROM leads ORDER BY created_at DESC LIMIT 10`

**Qué gráficos básicos incluye**:
- Gráfico de barras: Leads por estado
- Gráfico de línea: Leads creados por mes (últimos 6 meses)
- Usar librería simple: Recharts o Chart.js

**Layout**:
- Grid de cards con métricas
- Gráficos debajo
- Actividad reciente al final

### 3. Contacts

**Crear contacto**:
- Formulario con campos:
  - Nombre (requerido)
  - Email (requerido, único)
  - Teléfono (opcional)
  - Empresa (opcional)
  - Instagram (opcional)
  - Dirección fiscal (opcional)
  - Ciudad (opcional)
  - Código postal (opcional)
  - País (opcional)
  - CIF (opcional)
  - DNI (opcional)
  - IBAN (opcional)
- POST a `/api/contacts`
- Validación con Zod
- Redirige a lista tras crear

**Editar contacto**:
- Mismo formulario, pre-poblado
- PUT a `/api/contacts/[id]`
- Validación con Zod
- Redirige a detalle tras editar

**Listar contactos**:
- Tabla con columnas:
  - Nombre
  - Email
  - Empresa
  - Teléfono
  - Acciones (ver, editar, eliminar)
- Búsqueda por nombre/email
- Paginación (10 por página)
- GET a `/api/contacts?page=1&search=...`

**Relación con leads**:
- Un contacto puede tener múltiples leads
- Al crear lead, se puede seleccionar contacto existente
- En detalle de contacto, mostrar leads asociados

### 4. Leads

**Crear lead**:
- Formulario con campos:
  - Contacto (select, opcional - puede crear lead sin contacto)
  - Estado (select: nuevo, en proceso, cerrado, perdido)
  - Valor (número, opcional - en euros)
  - Notas (textarea, opcional)
- POST a `/api/leads`
- Validación con Zod
- Redirige a lista tras crear

**Editar lead**:
- Mismo formulario, pre-poblado
- PUT a `/api/leads/[id]`
- Validación con Zod
- Redirige a detalle tras editar

**Listar leads**:
- Tabla con columnas:
  - Contacto (nombre)
  - Estado (badge con color)
  - Valor (€)
  - Fecha creación
  - Acciones (ver, editar, eliminar)
- Filtro por estado
- Búsqueda por nombre de contacto
- Ordenamiento por fecha (más reciente primero)
- Paginación (10 por página)
- GET a `/api/leads?page=1&estado=nuevo&search=...`

**Estados simples**:
- `nuevo`: Lead recién creado (azul)
- `en_proceso`: Lead en seguimiento (amarillo)
- `cerrado`: Lead ganado (verde)
- `perdido`: Lead perdido (rojo)

**Relación con contactos**:
- Lead puede tener un contacto asociado (FK opcional)
- Al ver lead, mostrar datos del contacto si existe
- Al crear lead desde contacto, pre-seleccionar contacto

---

## 🔐 Flujo de Autenticación

### Arquitectura de Auth

**Sin middleware, todo explícito**:

1. **Login** (`/login`):
   - Página pública, sin `requireAuth()`
   - Formulario POST a `/api/auth/login`
   - API crea sesión, setea cookie
   - Frontend redirige a `/dashboard`

2. **Páginas Protegidas** (`/dashboard`, `/contacts`, `/leads`):
   - Cada página llama `requireAuth(context)` en `getServerSideProps`
   - Si no hay sesión → redirect a `/login`
   - Si hay sesión → renderiza página

3. **API Routes Protegidas** (`/api/contacts/*`, `/api/leads/*`):
   - Cada API route llama `requireAuth(context)` al inicio
   - Si no hay sesión → retorna 401
   - Si hay sesión → procesa request

### Función `requireAuth()`

**Ubicación**: `lib/auth.ts`

**Implementación**:
```typescript
// Pseudocódigo explicativo
async function requireAuth(context) {
  // 1. Leer cookie 'session_id' del request
  const sessionId = context.req.cookies.session_id
  
  // 2. Si no hay cookie → redirect a /login
  if (!sessionId) {
    redirect('/login')
  }
  
  // 3. Buscar sesión en BD
  const session = await prisma.session.findUnique({
    where: { token: sessionId },
    include: { user: true }
  })
  
  // 4. Si no existe sesión → redirect a /login
  if (!session) {
    redirect('/login')
  }
  
  // 5. Si sesión expirada → redirect a /login
  if (session.expires_at < new Date()) {
    redirect('/login')
  }
  
  // 6. Si todo OK → retornar usuario
  return session.user
}
```

**Uso en páginas**:
```typescript
export async function getServerSideProps(context) {
  const user = await requireAuth(context)
  // Si llegamos aquí, usuario está autenticado
  return { props: { user } }
}
```

**Uso en API routes**:
```typescript
export default async function handler(req, res) {
  const user = await requireAuth({ req, res })
  // Si llegamos aquí, usuario está autenticado
  // Procesar request...
}
```

### Crear Sesión

**Función**: `createSession(userId)`

**Qué hace**:
1. Genera token único (UUID)
2. Calcula `expires_at` (7 días desde ahora)
3. Inserta en tabla `sessions`
4. Setea cookie `session_id` con el token
5. Retorna sesión creada

### Eliminar Sesión

**Función**: `deleteSession(sessionId)`

**Qué hace**:
1. Elimina sesión de BD
2. Limpia cookie `session_id`
3. Usado en logout

### Logout

**Endpoint**: `POST /api/auth/logout`

**Qué hace**:
1. Lee cookie `session_id`
2. Elimina sesión de BD
3. Limpia cookie
4. Retorna success
5. Frontend redirige a `/login`

---

## 🗄️ Base de Datos

### Tablas Principales

#### 1. `users`

**Propósito**: Usuarios del sistema (solo uno en este caso)

**Campos**:
- `id`: SERIAL PRIMARY KEY
- `email`: TEXT UNIQUE NOT NULL
- `password_hash`: TEXT NOT NULL (bcrypt)
- `created_at`: TIMESTAMP DEFAULT now()
- `updated_at`: TIMESTAMP DEFAULT now()

**Relaciones**:
- `sessions.user_id` → `users.id` (FK)

#### 2. `sessions`

**Propósito**: Sesiones activas de usuarios

**Campos**:
- `id`: SERIAL PRIMARY KEY
- `user_id`: INTEGER NOT NULL (FK a users)
- `token`: TEXT UNIQUE NOT NULL (UUID)
- `expires_at`: TIMESTAMP NOT NULL
- `created_at`: TIMESTAMP DEFAULT now()

**Relaciones**:
- `sessions.user_id` → `users.id` (FK)

**Índices**:
- `token` (único, para búsqueda rápida)

#### 3. `contacts`

**Propósito**: Contactos del CRM

**Campos**:
- `id`: SERIAL PRIMARY KEY
- `nombre`: TEXT
- `email`: TEXT UNIQUE
- `telefono`: TEXT
- `empresa`: TEXT
- `instagram_user`: TEXT UNIQUE
- `direccion_fiscal`: TEXT
- `ciudad`: TEXT
- `codigo_postal`: TEXT
- `pais`: TEXT
- `cif`: TEXT
- `dni`: TEXT
- `iban`: TEXT
- `created_at`: TIMESTAMP DEFAULT now()
- `updated_at`: TIMESTAMP DEFAULT now()

**Relaciones**:
- `leads.contact_id` → `contacts.id` (FK opcional)

**Índices**:
- `email` (único)
- `instagram_user` (único)

#### 4. `leads`

**Propósito**: Leads/Oportunidades del CRM

**Campos**:
- `id`: SERIAL PRIMARY KEY
- `contact_id`: INTEGER (FK a contacts, opcional)
- `estado`: TEXT NOT NULL (nuevo, en_proceso, cerrado, perdido)
- `valor`: DECIMAL(10,2) (en euros, opcional)
- `notas`: TEXT
- `created_at`: TIMESTAMP DEFAULT now()
- `updated_at`: TIMESTAMP DEFAULT now()

**Relaciones**:
- `leads.contact_id` → `contacts.id` (FK opcional)

**Índices**:
- `contact_id` (para búsquedas por contacto)
- `estado` (para filtros)

### Schema Prisma

```prisma
// Pseudocódigo explicativo del schema

model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  password_hash String
  sessions      Session[]
  created_at    DateTime  @default(now())
  updated_at    DateTime  @default(now()) @updatedAt
}

model Session {
  id         Int      @id @default(autoincrement())
  user_id    Int
  token      String   @unique
  expires_at DateTime
  user       User     @relation(fields: [user_id], references: [id])
  created_at DateTime @default(now())
}

model Contact {
  id              Int     @id @default(autoincrement())
  nombre          String?
  email           String? @unique
  telefono        String?
  empresa         String?
  instagram_user  String? @unique
  direccion_fiscal String?
  ciudad          String?
  codigo_postal   String?
  pais            String?
  cif             String?
  dni             String?
  iban            String?
  leads           Lead[]
  created_at      DateTime @default(now())
  updated_at      DateTime @default(now()) @updatedAt
}

model Lead {
  id         Int      @id @default(autoincrement())
  contact_id Int?
  estado     String   // nuevo, en_proceso, cerrado, perdido
  valor      Decimal? @db.Decimal(10, 2)
  notas      String?
  contact    Contact? @relation(fields: [contact_id], references: [id])
  created_at DateTime @default(now())
  updated_at DateTime @default(now()) @updatedAt
}
```

### Migraciones

- Usar Prisma Migrate
- Migraciones incrementales
- Cada cambio de schema genera nueva migración
- Migraciones se ejecutan en Docker build o en startup

---

## 🔧 Variables de Entorno

### Variables Requeridas

#### 1. `DATABASE_URL`

**Propósito**: URL de conexión a PostgreSQL

**Formato**: `postgresql://user:password@host:port/database`

**Ejemplo**: `postgresql://postgres:password@localhost:5432/crm_buffalo`

**Qué pasa si falta**: La aplicación no puede conectarse a la BD y falla al iniciar

**Valores típicos**:
- Desarrollo: `postgresql://postgres:postgres@localhost:5432/crm_buffalo`
- Producción: Proporcionado por EasyPanel o servicio de BD

#### 2. `SESSION_SECRET`

**Propósito**: Secret para firmar cookies (aunque usamos tokens en BD, puede ser útil para seguridad adicional)

**Formato**: String aleatorio largo

**Ejemplo**: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

**Qué pasa si falta**: Cookies pueden ser inseguras

**Valores típicos**: Generar con `openssl rand -hex 32`

#### 3. `NODE_ENV`

**Propósito**: Entorno de ejecución (development, production)

**Formato**: `development` o `production`

**Ejemplo**: `production`

**Qué pasa si falta**: Next.js asume `development`, puede causar comportamientos inesperados

**Valores típicos**:
- Desarrollo: `development`
- Producción: `production`

#### 4. `PORT`

**Propósito**: Puerto donde escucha la aplicación

**Formato**: Número (3000, 80, etc.)

**Ejemplo**: `3000`

**Qué pasa si falta**: Next.js usa puerto por defecto (3000), pero Docker/EasyPanel puede esperar otro

**Valores típicos**:
- Desarrollo: `3000`
- Producción: `3000` (EasyPanel espera este puerto)

### Archivo `.env.example`

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/crm_buffalo
SESSION_SECRET=your-secret-key-here
NODE_ENV=production
PORT=3000
```

### Validación de Variables

- Al iniciar la aplicación, verificar que todas las variables requeridas estén presentes
- Si falta alguna, loggear error claro y salir con código de error
- No usar valores por defecto "mágicos"

---

## 🚀 Deploy en EasyPanel

### Construcción del Proyecto

**Comando de build**:
```bash
npm run build
```

**Qué hace**:
1. Instala dependencias (`npm ci`)
2. Genera Prisma Client (`npx prisma generate`)
3. Ejecuta migraciones (`npx prisma migrate deploy`)
4. Construye Next.js (`next build`)

**Output**:
- Carpeta `.next` con build optimizado
- Prisma Client generado
- Migraciones aplicadas

### Dockerización

**Dockerfile simple**:

```dockerfile
# Pseudocódigo explicativo

# 1. Imagen base Node.js
FROM node:20-alpine

# 2. Instalar dependencias del sistema
RUN apk add --no-cache openssl

# 3. Crear directorio de trabajo
WORKDIR /app

# 4. Copiar archivos de dependencias
COPY package.json package-lock.json ./
RUN npm ci

# 5. Copiar código fuente
COPY . .

# 6. Generar Prisma Client
RUN npx prisma generate

# 7. Construir Next.js
RUN npm run build

# 8. Exponer puerto
EXPOSE 3000

# 9. Comando de inicio
CMD ["npm", "start"]
```

**Características**:
- Una sola etapa (no multi-stage, para simplicidad)
- Puerto fijo: 3000
- Comando simple: `npm start`
- Sin optimizaciones complejas

### Configuración en EasyPanel

**Qué espera EasyPanel**:

1. **Dockerfile presente**: En raíz del proyecto
2. **Puerto configurado**: Aplicación debe escuchar en puerto especificado (típicamente 3000)
3. **Variables de entorno**: Configurables en UI de EasyPanel
4. **Health check**: Opcional, pero recomendado

**Pasos en EasyPanel**:

1. Crear nuevo "App" en EasyPanel
2. Conectar repositorio GitHub
3. Seleccionar branch (main)
4. Configurar variables de entorno:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `NODE_ENV=production`
   - `PORT=3000`
5. EasyPanel detecta Dockerfile automáticamente
6. Build se ejecuta automáticamente
7. App se despliega en contenedor

**Qué NO hacer**:

- ❌ NO usar `output: 'standalone'` (causa problemas)
- ❌ NO usar multi-stage builds complejos
- ❌ NO cambiar puerto dinámicamente
- ❌ NO usar variables de entorno "mágicas"
- ❌ NO asumir paths relativos que no funcionan en Docker

### Health Check

**Endpoint recomendado**: `GET /api/health`

**Qué retorna**:
```json
{
  "status": "ok",
  "database": "connected"
}
```

**Implementación**:
- Verifica conexión a BD
- Retorna 200 si todo OK
- Retorna 500 si hay problemas

**Configuración en EasyPanel**:
- Path: `/api/health`
- Interval: 30 segundos
- Timeout: 5 segundos

### Logs en Producción

**Qué loguear**:
- Errores de aplicación
- Errores de BD
- Requests importantes (login, logout, creación de leads/contactos)

**Qué NO loguear**:
- Cada request HTTP (spam)
- Información sensible (passwords, tokens)
- Logs de debug en producción

**Formato**:
- JSON estructurado (opcional)
- O texto simple con timestamps
- Niveles: error, warn, info

---

## ✅ Checklist de Implementación

### Fase 1: Setup Inicial

- [ ] Crear repositorio nuevo en GitHub
- [ ] Inicializar proyecto Next.js con Pages Router
- [ ] Configurar TypeScript
- [ ] Configurar TailwindCSS
- [ ] Instalar shadcn/ui y componentes base
- [ ] Configurar Prisma
- [ ] Crear estructura de carpetas
- [ ] Configurar ESLint/Prettier

### Fase 2: Base de Datos

- [ ] Definir schema Prisma completo
- [ ] Crear migración inicial
- [ ] Configurar conexión a PostgreSQL
- [ ] Probar conexión en desarrollo
- [ ] Crear usuario inicial (seed script)

### Fase 3: Autenticación

- [ ] Implementar `lib/auth.ts` con todas las funciones
- [ ] Crear página `/login`
- [ ] Crear API route `/api/auth/login`
- [ ] Crear API route `/api/auth/logout`
- [ ] Implementar `requireAuth()` helper
- [ ] Probar flujo completo de login/logout

### Fase 4: Layout y Navegación

- [ ] Crear componente `Sidebar`
- [ ] Crear componente `Layout`
- [ ] Aplicar layout manualmente en páginas protegidas
- [ ] Configurar navegación del Sidebar
- [ ] Probar que login NO tiene Sidebar
- [ ] Probar que páginas protegidas SÍ tienen Sidebar

### Fase 5: Dashboard

- [ ] Crear página `/dashboard`
- [ ] Implementar consultas de métricas
- [ ] Crear componentes de cards de estadísticas
- [ ] Integrar gráficos (Recharts o Chart.js)
- [ ] Mostrar actividad reciente
- [ ] Aplicar layout con Sidebar
- [ ] Probar autenticación requerida

### Fase 6: Contacts

- [ ] Crear página `/contacts` (lista)
- [ ] Crear página `/contacts/[id]` (detalle/edición)
- [ ] Crear API route `/api/contacts` (GET, POST)
- [ ] Crear API route `/api/contacts/[id]` (GET, PUT, DELETE)
- [ ] Implementar formulario de contacto
- [ ] Implementar tabla de contactos
- [ ] Implementar búsqueda y paginación
- [ ] Validación con Zod
- [ ] Probar CRUD completo

### Fase 7: Leads

- [ ] Crear página `/leads` (lista)
- [ ] Crear página `/leads/[id]` (detalle/edición)
- [ ] Crear API route `/api/leads` (GET, POST)
- [ ] Crear API route `/api/leads/[id]` (GET, PUT, DELETE)
- [ ] Implementar formulario de lead
- [ ] Implementar tabla de leads
- [ ] Implementar filtros por estado
- [ ] Implementar búsqueda y paginación
- [ ] Validación con Zod
- [ ] Probar CRUD completo
- [ ] Probar relación con contactos

### Fase 8: Estilos y UI

- [ ] Aplicar estilos tipo Holded
- [ ] Verificar que todos los componentes shadcn/ui funcionan
- [ ] Ajustar espaciado y tipografía
- [ ] Verificar responsive (básico)
- [ ] Probar en diferentes navegadores

### Fase 9: Docker y Deploy

- [ ] Crear Dockerfile simple
- [ ] Crear `.dockerignore`
- [ ] Probar build local de Docker
- [ ] Probar run local de contenedor
- [ ] Configurar variables de entorno
- [ ] Crear endpoint `/api/health`
- [ ] Probar deploy en EasyPanel
- [ ] Verificar que todo funciona en producción

### Fase 10: Testing y Ajustes

- [ ] Probar flujo completo de usuario
- [ ] Verificar que no hay errores en consola
- [ ] Verificar que logs son útiles
- [ ] Ajustar performance si es necesario
- [ ] Documentar cualquier configuración especial

---

## 📝 Notas Finales

### Principios a Recordar

1. **Simplicidad sobre Complejidad**: Si algo es complicado, simplificarlo
2. **Explicitud sobre Implicitud**: Todo debe ser visible y claro
3. **Estabilidad sobre Features**: Preferir código estable a nuevas funcionalidades
4. **Debugging sobre Performance**: Logs claros son más importantes

### Mantenibilidad

Este proyecto debe ser mantenible por cualquier desarrollador con conocimientos básicos de:
- React
- Next.js Pages Router
- TypeScript
- PostgreSQL
- Docker básico

### Escalabilidad

Este proyecto NO está diseñado para escalar horizontalmente. Es para un solo usuario interno. Si en el futuro se necesita escalar, se puede refactorizar, pero por ahora: simple y funcional.

### Soporte

Cualquier problema debe ser fácil de debuggear:
- Logs claros
- Errores descriptivos
- Código legible
- Documentación en código

---

**Fin de la Especificación**

Este documento es el plano completo para construir CRM Buffalo desde cero, manteniendo el diseño visual actual pero con una arquitectura técnica simple, estable y mantenible.

