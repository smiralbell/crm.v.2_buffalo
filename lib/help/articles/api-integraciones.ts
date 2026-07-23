import type { HelpArticle } from '../types'

export const ARTICLES_API: HelpArticle[] = [
  {
    id: 'api-auth',
    title: 'API: autenticación',
    summary: 'Login, logout, me, Google OAuth y cookie de sesión',
    category: 'api',
    order: 1,
    audience: ['all'],
    tags: ['API', 'auth', 'login', 'sesión', 'cookie'],
    body: `# API · Autenticación

Base: \`/api/auth/\`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | \`/api/auth/login\` | Body: email + password → cookie \`session_id\` |
| POST | \`/api/auth/logout\` | Invalida / limpia sesión |
| GET | \`/api/auth/me\` | Usuario actual (\`id\`, \`email\`, \`role\`, …) |
| GET | \`/api/auth/google\` | Inicia OAuth Google (admins allowlist) |
| GET | \`/api/auth/google/callback\` | Callback OAuth |

## Cómo llamar a las APIs protegidas

1. Inicia sesión en el navegador (cookie HttpOnly se envía sola).
2. Desde el CRM: \`fetch('/api/…')\` con credenciales por defecto.
3. El servidor valida la cookie con \`requireAuthAPI\` / \`requireAuth\`.
4. Además se aplica **RBAC** por rol (\`lib/auth-rbac.ts\`): un comercial no puede llamar a \`/api/finances/*\`.

## Errores habituales

- Sin sesión → 401 / redirect login.
- Rol sin permiso → 403.
`,
  },
  {
    id: 'api-crm-core',
    title: 'API: leads, contactos y pipelines',
    summary: 'Endpoints del CRM comercial clásico',
    category: 'api',
    order: 2,
    audience: ['admin'],
    tags: ['API', 'leads', 'contacts', 'pipelines'],
    body: `# API · Leads, contactos, pipelines

## Leads

| Método | Ruta |
|--------|------|
| GET, POST | \`/api/leads\` |
| GET, PATCH, DELETE… | \`/api/leads/[id]\` |

## Contactos

| Método | Ruta |
|--------|------|
| GET, POST | \`/api/contacts\` |
| GET… | \`/api/contacts/[id]\` |
| GET | \`/api/contacts/suggest\` |

## Pipelines

| Método | Ruta |
|--------|------|
| GET, POST | \`/api/pipelines\` |
| GET… | \`/api/pipelines/[id]\` |
| POST | \`/api/pipelines/[id]/stages\` |
| POST | \`/api/pipelines/[id]/cards\` · \`…/cards/[cardId]\` |
| GET | \`/api/pipelines/lookup\` |

Todas requieren sesión **admin** (salvo rutas de pipeline que el comercial usa vía prefijos coldcall/pipelines).
`,
  },
  {
    id: 'api-coldcall',
    title: 'API: cold calling y comercial',
    summary: 'Campañas, llamadas, prospectos, reuniones y métricas',
    category: 'api',
    order: 3,
    audience: ['admin', 'comercial'],
    tags: ['API', 'coldcall', 'comercial', 'campañas'],
    body: `# API · Cold call

Prefijo: \`/api/coldcall/\` — roles **admin** y **comercial**.

## Campañas

- \`GET|POST /api/coldcall/campaigns\`
- \`GET|POST /api/coldcall/campaigns/[id]\`
- \`…/script\` · \`…/mapping\` · \`…/presentation\`
- \`…/import\` · preview
- \`…/leads\` · \`…/leads/[leadId]\`
- \`…/call-session\`

## Prospectos y operativa

- \`/api/coldcall/prospects\` · \`/[id]\` · \`/lookup\` · \`/prospect-requests\`
- \`POST /api/coldcall/calls\`
- \`POST /api/coldcall/convert-to-lead\`
- \`POST /api/coldcall/schedule-meeting\`
- \`POST /api/coldcall/search-places\`
- \`POST /api/coldcall/import\`

## UX ventas

- \`GET /api/coldcall/callbacks\`
- \`GET /api/coldcall/meetings\` · \`/meeting-reminders\`
- \`GET /api/coldcall/duplicates\`
- \`GET|PUT /api/coldcall/my-objections\`

## Analytics

- \`GET /api/coldcall/dashboard\` · \`/team-dashboard\` · \`/metrics\` · \`/phone-lookup\`
`,
  },
  {
    id: 'api-engranajes',
    title: 'API: onboarding, demos, proyectos, retención',
    summary: 'ENG 2–4: endpoints de producto, ejecución e informes',
    category: 'api',
    order: 4,
    audience: ['admin', 'developer'],
    tags: ['API', 'onboarding', 'demos', 'gestion-proyecto', 'retencion'],
    body: `# API · Engranajes 2–4

## Onboarding

- \`GET /api/onboarding/projects/[leadId]\`
- \`GET /api/onboarding/projects/buffalo-status\`
- \`POST /api/onboarding/custom-brief\`
- \`POST /api/onboarding/pipeline-advance\`

## Demos

- \`/api/demos\` · \`/[id]\` · conversation · formulario · llamar · memory
- \`/api/demos/retell-voices\` · \`check-phones\`
- Webhooks: \`/api/demos/webhook\` · \`/webhook-voz\`
- Público: \`/api/formulario/[token]\` · \`…/llamar\`

## Gestión de proyecto

Prefijo \`/api/gestion-proyecto/\` (admin + developer acotado):

- \`/proyectos\` · \`/[id]\` · \`/by-lead/[leadId]\`
- \`…/dashboard\` · \`…/tasks\` · adjuntos
- \`…/docs\` · upload · file
- \`…/developers\` · \`…/onboarding\`
- \`POST …/finalizar\` · \`POST …/ai-analysis\`
- \`/asignaciones/[id]\`

## Retención

Prefijo \`/api/retencion/\`:

- \`GET /proyectos\` · \`/proyectos/[id]\`
- \`POST …/agent-chat\`
- \`GET|PATCH …/agent-config\`
- \`GET|PATCH|POST …/monthly-report\`
- \`POST …/informes/[reportId]/chat\`
- \`GET|PATCH|POST …/metrics/discover\`

## Tickets

- \`GET /api/tickets\` · \`/[id]\`
- \`GET|PATCH /api/tickets/config\`
- Webhook: \`POST /api/webhooks/tickets\`
`,
  },
  {
    id: 'api-finanzas-users',
    title: 'API: finanzas, facturas, usuarios y resto',
    summary: 'Banco, invoices, developer invoices, users, marketing, webhooks',
    category: 'api',
    order: 5,
    audience: ['admin'],
    tags: ['API', 'finance', 'invoices', 'users', 'webhooks', 'marketing'],
    body: `# API · Finanzas, usuarios y más

## Finanzas y banco

- \`/api/finance/executive-summary\`, \`transactions\`, \`ai-analysis\`, …
- \`/api/finances/incomes|expenses|salaries|settings\` (+ \`[id]\`)
- \`GET /api/bank/connection-status\` · \`POST /api/bank/sync\`

## Facturas cliente

- \`/api/invoices\` · \`/[id]\` · export · send-to-drive
- \`/api/invoices/recurring\` · generate

## Facturas freelance

- \`/api/developer/invoices\` · \`/[id]\` · pdf
- \`GET /api/developer/dashboard\`

## Marketing

- \`/api/marketing/metrics\`, \`web-metrics\`, \`web-dashboard\`
- \`web-form-submissions\`, \`cal-bookings\`

## Usuarios

- \`/api/users\` · \`/[id]\` · developers · detail · assignments
- \`/api/team-members\`

## Webhooks e integraciones

| Ruta | Uso |
|------|-----|
| \`POST /api/webhooks/calcom\` | Reservas Cal.com |
| \`POST /api/webhooks/instantly\` | Email outreach |
| \`POST /api/webhooks/onboarding-form\` | Form externo onboarding |
| \`POST /api/webhooks/tickets\` | Tickets cliente |
| \`POST /api/engranaje5/proyectos/sync\` | Sync KPIs retención |
| \`/api/integrations/google/*\` | OAuth y Calendar |

## Misc

- \`GET /api/health\`
- \`/api/checklist\` · \`/[id]\`
- \`/api/analisis/ai-analysis\`
- \`/api/agent-chats/sessions\` · \`messages\`
`,
  },
  {
    id: 'api-como-usar',
    title: 'Cómo usar la API en la práctica',
    summary: 'Patrones fetch, errores, límites y ejemplos',
    category: 'api',
    order: 6,
    audience: ['all'],
    tags: ['API', 'fetch', 'ejemplos', 'JSON', 'errores'],
    body: `# Cómo usar la API

## Desde el propio CRM (recomendado)

\`\`\`ts
const res = await fetch('/api/leads', { credentials: 'include' })
const data = await res.json()
if (!res.ok) throw new Error(data.error || 'Error')
\`\`\`

Para mutaciones:

\`\`\`ts
await fetch('/api/leads', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* campos */ }),
})
\`\`\`

## Códigos de respuesta

| Código | Significado |
|--------|-------------|
| 200 / 201 | OK / creado |
| 400 | Validación / body inválido |
| 401 | Sin sesión |
| 403 | Rol sin permiso o sin acceso al recurso |
| 404 | No encontrado |
| 405 | Método no permitido |
| 500 / 503 | Error servidor / migración pendiente |

## Webhooks externos

Llevan token propio (header o query según el handler). **No** usan la cookie de sesión del CRM. Consulta la ficha de cada webhook (Cal.com, Instantly, tickets, onboarding-form).

## Buenas prácticas

1. No expongas \`SESSION_SECRET\` ni API keys en el cliente.
2. Para Postgres de clientes (retención) usa solo las tools/endpoints read-only.
3. Respeta límites de payload (muchas rutas validan con Zod).
4. Tras cambios de schema, ejecuta los SQL de \`prisma/\` indicados en errores 503.
`,
  },
]

export const ARTICLES_INTEGRACIONES: HelpArticle[] = [
  {
    id: 'integraciones',
    title: 'Integraciones externas',
    summary: 'Google, Cal.com, Wasender, Retell, Instantly, Enable Banking',
    category: 'integraciones',
    order: 1,
    audience: ['admin'],
    tags: ['google', 'calcom', 'wasender', 'retell', 'instantly', 'banco'],
    body: `# Integraciones

| Sistema | Para qué | Entrada en el CRM |
|---------|----------|-------------------|
| **Google OAuth / Calendar** | Login admin, eventos, notas | \`/api/integrations/google/*\`, Calendario |
| **Cal.com** | Reservas web | Webhook + marketing calendario |
| **Instantly** | Email outreach | Webhook + tab Email |
| **Wasender** | WhatsApp demos / secretaria | Webhooks demos |
| **Retell** | Llamadas de voz demo | \`/api/demos/[id]/llamar\` |
| **Enable Banking** | Extractos bancarios | Finanzas → sync |
| **OpenRouter** | LLMs (análisis, demos, retención) | Server-side |

Cada integración exige variables de entorno (ver artículo siguiente). Los webhooks deben apuntar a \`NEXT_PUBLIC_BASE_URL\` / \`APP_BASE_URL\` público HTTPS.
`,
  },
  {
    id: 'entorno',
    title: 'Variables de entorno (sin secretos)',
    summary: 'Qué hay que configurar para que el ERP funcione en producción',
    category: 'integraciones',
    order: 2,
    audience: ['admin'],
    tags: ['env', '.env', 'configuración', 'deploy'],
    body: `# Variables de entorno

**Nunca subas el \`.env\` a Git.** Aquí solo los nombres.

## Núcleo

- \`DATABASE_URL\` — PostgreSQL
- \`SESSION_SECRET\` — firma de cookies
- \`CRM_ADMIN_EMAIL\` / \`CRM_ADMIN_PASSWORD\` — admin bootstrap
- \`NEXT_PUBLIC_BASE_URL\` / \`APP_BASE_URL\` — URL pública

## IA

- \`OPENROUTER_API_KEY\`, \`OPENROUTER_MODEL\`
- \`DEMO_*\`, \`RETENCION_OPENROUTER_MODEL\`

## Google

- \`GOOGLE_CLIENT_ID\` / \`SECRET\`, redirect URIs, \`GOOGLE_ADMIN_EMAILS\`
- Refresh token / organizer / Places / encryption key

## Banco

- \`ENABLEBANKING_APP_ID\`, \`ENABLEBANKING_PRIVATE_KEY\`, redirect URLs

## Comms

- SMTP / Gmail app password
- \`WASENDER_*\`, \`RETELL_*\`, \`FORM_ACCESS_SECRET\`

## Pipelines y webhooks

- IDs de pipelines globales / web / coldcall
- Tokens Cal.com, Instantly, onboarding-form, tickets

Consulta también el \`README.md\` del repo para el arranque local (\`npm run dev\`, migraciones SQL).
`,
  },
  {
    id: 'glosario',
    title: 'Glosario rápido',
    summary: 'Términos Buffalo que aparecen por todo el ERP',
    category: 'integraciones',
    order: 3,
    audience: ['all'],
    tags: ['glosario', 'diccionario', 'términos'],
    body: `# Glosario

| Término | Significado |
|---------|-------------|
| **ENG 1–4** | Engranajes Marketing → Onboarding → Proyectos → Retención |
| **es_buffalo** | Flag: el proyecto está en marcha internamente |
| **Mensualidad / retainer** | Cuota recurrente de mantenimiento |
| **MRR** | Monthly Recurring Revenue |
| **Pipeline** | Tablero Kanban |
| **Lead** | Oportunidad comercial |
| **Cold call** | Captación telefónica / campañas |
| **BRM** | Buffalo Report Markdown (informes visuales) |
| **REAL_METRICS** | Bloque de métricas reales de la BD del cliente |
| **Freelancer invoice** | Factura de developer/comercial a Buffalo |
| **Client invoice** | Factura de Buffalo al cliente final |
`,
  },
  {
    id: 'mcp-crm',
    title: 'MCP Buffalo CRM (agente con acceso total)',
    summary: 'Servidor MCP stdio: leer, escribir y borrar con doble confirmación',
    category: 'integraciones',
    order: 4,
    audience: ['admin'],
    tags: ['MCP', 'agente', 'Cursor', 'tools', 'postgres'],
    body: `# MCP Buffalo CRM

Hay un servidor MCP en \`mcp/buffalo-crm/\` para que un agente (p. ej. Cursor) opere el CRM con acceso total a datos.

## Qué puede hacer

- Leer schema y datos (\`crm_list_tables\`, \`crm_describe_table\`, \`crm_query\`, \`crm_search\`, \`crm_get_row\`)
- Escribir (\`crm_insert_row\`, \`crm_update_row\`, \`crm_execute_sql\`)
- Borrar (\`crm_delete_rows\`, \`crm_execute_destructive\`) con **doble confirmación**

## Doble confirmación

1. \`confirm_step: 1\` → preview + \`confirm_token\` (no borra)
2. \`confirm_step: 2\` + \`confirm: true\` + mismo token y parámetros → ejecuta

## Arranque

\`\`\`bash
npm run mcp:crm
\`\`\`

Config Cursor: \`.cursor/mcp.json\` (servidor \`buffalo-crm\`). Usa el \`.env\` del repo (\`DATABASE_URL\`).

Detalle: \`mcp/buffalo-crm/README.md\`.
`,
  },
]
