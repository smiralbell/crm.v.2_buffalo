import type { HelpArticle } from '../types'

export const ARTICLES_INICIO: HelpArticle[] = [
  {
    id: 'modelo-negocio',
    title: 'Modelo de negocio: los 4 engranajes',
    summary: 'Cómo Buffalo organiza Marketing → Onboarding → Proyectos → Retención',
    category: 'inicio',
    order: 1,
    audience: ['all'],
    tags: ['engranajes', 'ENG', 'negocio', 'flujo', 'buffalo'],
    body: `# Modelo de negocio Buffalo

Buffalo vende proyectos de IA (agentes de voz/chat, dashboards, automatización, lead gen, GEO/SEO). El CRM organiza el recorrido del cliente en **cuatro engranajes** visibles en el menú lateral (admin):

| Badge | Área | Qué significa |
|-------|------|---------------|
| **ENG 1** | Marketing | Captación: web, email Instantly, cold call, Meta Ads, Google Ads |
| **ENG 2** | Onboarding | Configurar el proyecto del cliente, propuesta/contrato/factura y **poner en marcha** |
| **ENG 3** | Proyectos | Ejecución interna: tareas, developers, tickets (solo proyectos Buffalo en marcha) |
| **ENG 4** | Retención | Clientes con **mensualidad** + informes y KPIs de mantenimiento |

## Cadena de verdad (imprescindible)

1. Se crea/elige un **contacto** → **lead**.
2. En Onboarding se guarda la configuración del lead (\`leads.configuracion\`).
3. El sync crea/actualiza la fila en **\`proyectos\`** (\`es_buffalo = false\` al nacer).
4. Un admin pulsa **Poner en marcha** → \`es_buffalo = true\` → aparece en Gestión de proyectos.
5. Al terminar desarrollo → **Finalizar proyecto** → \`status = 'active'\` (producción).
6. Si hay retainer/mensualidad → aparece en **Retención**.

> Sin onboarding configurado válido, un proyecto **no** debe contar como Buffalo en marcha.

## Distinciones que no hay que mezclar

- **Pipeline Kanban** (tablero) ≠ **estado del lead** ≠ **status del proyecto** ≠ **stage de cold call**.
- Dinero: siempre en **EUR**. Distingue setup (one-shot) vs **mensualidad (MRR)**.
`,
  },
  {
    id: 'roles-acceso',
    title: 'Roles, login y permisos',
    summary: 'Admin, developer y comercial: qué ve cada uno y cómo autenticarse',
    category: 'inicio',
    order: 2,
    audience: ['all'],
    tags: ['roles', 'login', 'sesión', 'permisos', 'RBAC'],
    body: `# Roles y acceso

## Los tres roles

| Rol | Home | Ve principalmente |
|-----|------|-------------------|
| **admin** | \`/dashboard\` | Todo el CRM |
| **developer** | \`/developer\` | Proyectos asignados, tickets, retención (sin precios), facturas freelance |
| **comercial** | \`/comercial\` | Cold calling, pipeline, reuniones, callbacks, facturas freelance |

## Cómo entrar

1. **Email + contraseña** → pantalla \`/login\` → \`POST /api/auth/login\`.
2. **Google** (solo admins en lista blanca) → botón Google en login.
3. La sesión vive en cookie HttpOnly \`session_id\` (firmada, ~7 días).
4. \`GET /api/auth/me\` devuelve el usuario actual; el cliente redirige si el rol no puede ver la ruta.

## Qué puede hacer cada rol

| Capacidad | admin | developer | comercial |
|-----------|:-----:|:---------:|:---------:|
| Leads, finanzas, marketing, onboarding | ✓ | | |
| Gestión de proyectos / tickets / retención | ✓ | ✓ (acotado) | |
| Cold call / panel comercial | ✓ | | ✓ |
| Facturas freelance (\`/developer/facturas\`) | | ✓ | ✓ |
| Facturas cliente (\`/invoices\`) | ✓ | | |
| Usuarios | ✓ | | |
| Centro de ayuda (\`/ayuda\`) | ✓ | ✓ | ✓ |

Los developers solo ven proyectos ligados en \`crm_user_projects\` (y asignaciones). En retención **no** ven precios/mensualidades.

## Cerrar sesión

En el pie del menú lateral → **Cerrar sesión** → \`POST /api/auth/logout\`.
`,
  },
  {
    id: 'navegacion',
    title: 'Navegación del menú lateral',
    summary: 'Mapa de todas las entradas del sidebar por rol',
    category: 'inicio',
    order: 3,
    audience: ['all'],
    tags: ['sidebar', 'menú', 'navegación', 'rutas'],
    body: `# Menú lateral

El sidebar se filtra por rol. Al pasar el ratón (desktop) se expande y empuja el contenido.

## Admin

- **Dashboard** → \`/dashboard\`
- **Leads** → \`/leads\`
- **Finanzas** → Resumen, Facturas, Recurrentes
- **Pipelines** → \`/pipelines\`
- **Marketing (ENG 1)** → tabs global / web / email / coldcalling / meta / google
- **Onboarding (ENG 2)** → Proyectos activos, Configurador, Demos
- **Proyectos (ENG 3)** → Abiertos, Tickets
- **Retención (ENG 4)** → Buffalo con mensualidad
- **Calendario**, **Análisis IA**, **Checklist**
- Pie: tema, **Usuarios**, cerrar sesión, **Ayuda** (?)

## Developer

Orden: Dashboard → Proyectos → Retención → Facturas (+ Ayuda).

## Comercial

Sección **Llamadas** (con CTA *Llamar ahora*) + Inicio, Campañas, Pipeline, Reuniones, Llamar más tarde, Objeciones, Duplicados, Preparar demos, Facturas (+ Ayuda).

## Contactos

\`/contacts\` no está en el sidebar: se alcanza desde leads o enlaces internos.
`,
  },
]
