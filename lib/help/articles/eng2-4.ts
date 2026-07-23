import type { HelpArticle } from '../types'

export const ARTICLES_ENG2: HelpArticle[] = [
  {
    id: 'onboarding',
    title: 'Onboarding (ENG 2)',
    summary: 'Configurador, proyectos activos, poner en marcha y brief a medida',
    category: 'eng2',
    order: 1,
    audience: ['admin'],
    tags: ['onboarding', 'ENG2', 'configurador', 'poner en marcha', 'brief'],
    body: `# Onboarding · ENG 2

## Pantallas

| Pantalla | Ruta |
|----------|------|
| Proyectos activos | \`/onboarding?tab=projects\` |
| Configurador | \`/onboarding/configure\` |
| Brief a medida | \`/onboarding/custom\` |
| Detalle proyecto | \`/onboarding/proyectos/[id]\` |
| Demos | \`/demos\` |

## Flujo

1. Elige o crea un lead.
2. Configura el paquete Buffalo (o brief IA a medida).
3. Se persiste \`leads.configuracion\` y se sincroniza \`proyectos\`.
4. Cuando esté listo: **Poner en marcha** → \`es_buffalo = true\` → aparece en ENG 3.

## APIs

- \`GET /api/onboarding/projects/[leadId]\`
- \`GET /api/onboarding/projects/buffalo-status\`
- \`POST /api/onboarding/custom-brief\`
- \`POST /api/onboarding/pipeline-advance\`
- Webhook externo: \`POST /api/webhooks/onboarding-form\` (token \`ONBOARDING_FORM_WEBHOOK_TOKEN\`)
`,
  },
  {
    id: 'demos',
    title: 'Demos WhatsApp y voz',
    summary: 'Crear demos, formulario público, llamadas Retell y webhooks Wasender',
    category: 'eng2',
    order: 2,
    audience: ['admin'],
    tags: ['demos', 'whatsapp', 'retell', 'wasender', 'formulario'],
    body: `# Demos

Rutas: \`/demos\`, \`/demos/[id]\` · Formulario público: \`/formulario/[token]\`

## Qué hace una demo

Configura un agente de chat (WhatsApp vía Wasender) y/o voz (Retell) para enseñar el producto al prospecto. Puede incluir **formulario público** tokenizado y memoria de conversación.

## APIs principales

| Método | Ruta | Uso |
|--------|------|-----|
| GET, POST | \`/api/demos\` | Listar / crear |
| GET, PUT, DELETE | \`/api/demos/[id]\` | CRUD |
| GET | \`/api/demos/[id]/conversation\` | Historial |
| GET, PUT | \`/api/demos/[id]/formulario\` | Config formulario |
| POST | \`/api/demos/[id]/llamar\` | Llamada outbound Retell |
| POST, DELETE | \`/api/demos/[id]/memory\` | Memoria |
| GET | \`/api/demos/retell-voices\` | Catálogo de voces |
| POST | \`/api/demos/webhook\` · \`/webhook-voz\` | Wasender / Retell |
| GET/POST | \`/api/formulario/[token]\` | Formulario público |

## Variables

\`WASENDER_API_KEY\`, \`WASENDER_WEBHOOK_SECRET\`, \`RETELL_API_KEY\`, \`RETELL_PHONE_NUMBER\`, \`FORM_ACCESS_SECRET\`.
`,
  },
]

export const ARTICLES_ENG3: HelpArticle[] = [
  {
    id: 'gestion-proyecto',
    title: 'Gestión de proyectos (ENG 3)',
    summary: 'Proyectos Buffalo, tareas, docs, developers y finalizar',
    category: 'eng3',
    order: 1,
    audience: ['admin', 'developer'],
    tags: ['proyectos', 'ENG3', 'tareas', 'developers', 'docs'],
    body: `# Proyectos · ENG 3

Solo aparecen proyectos con **\`es_buffalo = true\`** y onboarding válido.

## Pantallas

- Listado: \`/gestion-proyecto\`
- Detalle: \`/gestion-proyecto/proyectos/[id]\` (tareas, docs, developers, IA)
- Asignación puntual: \`/gestion-proyecto/asignaciones/[id]\`
- Dashboard developer: \`/developer\`

## APIs

| Ruta | Uso |
|------|-----|
| \`GET /api/gestion-proyecto/proyectos\` | Listado (filtrado por rol) |
| \`GET /api/gestion-proyecto/proyectos/[id]\` | Detalle |
| \`GET|PATCH …/dashboard\` | KPIs del proyecto |
| \`GET|POST …/tasks\` · \`PATCH|DELETE …/tasks/[taskId]\` | Tareas |
| \`…/attachments/upload\` · \`…/file\` | Adjuntos de tarea |
| \`GET|POST|DELETE …/docs\` · upload · file | Documentos |
| \`GET|PUT …/developers\` | Asignar developers |
| \`PATCH …/onboarding\` | Brief de onboarding para el equipo |
| \`POST …/finalizar\` | Cerrar proyecto (producción) |
| \`POST …/ai-analysis\` | Análisis IA del proyecto |
| \`GET|PATCH /api/gestion-proyecto/asignaciones/[id]\` | Asignaciones |

Developers solo ven lo asignado vía \`crm_user_projects\`.
`,
  },
  {
    id: 'tickets',
    title: 'Tickets de soporte',
    summary: 'Inbox de tickets y webhook bidireccional con el dashboard del cliente',
    category: 'eng3',
    order: 2,
    audience: ['admin', 'developer'],
    tags: ['tickets', 'soporte', 'webhook', 'cliente'],
    body: `# Tickets

Rutas: \`/tickets\`, \`/tickets/[id]\`, \`/tickets/config\`

## Uso interno

Los tickets llegan desde el dashboard del cliente (o se crean vía webhook). El equipo Buffalo responde desde el CRM.

## APIs

- \`GET /api/tickets\` · \`GET /api/tickets/[id]\` (con respuestas)
- \`GET|PATCH /api/tickets/config\` — URL/token del webhook
- Ingest externo: \`POST /api/webhooks/tickets\`

## Integrador externo

Ver también documentación técnica \`docs/TICKETS_WEBHOOK.md\`:

1. Configura token (\`TICKETS_WEBHOOK_TOKEN\` o el de la UI).
2. El cliente envía eventos al webhook.
3. El CRM puede notificar de vuelta según la config.

Developers ven tickets de sus proyectos asignados.
`,
  },
]

export const ARTICLES_ENG4: HelpArticle[] = [
  {
    id: 'retencion-overview',
    title: 'Retención (ENG 4): visión general',
    summary: 'Proyectos con mensualidad, mantenimiento e informes',
    category: 'eng4',
    order: 1,
    audience: ['admin', 'developer'],
    tags: ['retención', 'ENG4', 'mensualidad', 'mantenimiento', 'MRR'],
    body: `# Retención · ENG 4

Lista proyectos Buffalo con **mensualidad / mantenimiento** (\`has_mensualidad\`).

- Listado: \`/retencion\`
- Ficha: \`/retencion/proyectos/[id]\`

## Fases en la ficha del proyecto

1. **Auditoría / chat** — el agente construye el contexto del proyecto.
2. **Contexto** — documento revisable + checklist + Postgres del cliente (solo lectura).
3. **Informe** — genera informe cliente o Buffalo, plantilla visual, PDF, chat de edición.

## Qué es el mantenimiento

Buffalo cobra una cuota recurrente por mantener el sistema en producción (monitorización, mejoras, informes de valor). El informe mensual demuestra ROI y salud de la cuenta.

Developers ven la operativa **sin precios**.
`,
  },
  {
    id: 'retencion-agente',
    title: 'Agente de auditoría e informes',
    summary: 'Contexto, Postgres read-only, métricas reales, BRM, PDF y chat de edición',
    category: 'eng4',
    order: 2,
    audience: ['admin', 'developer'],
    tags: ['agente', 'informe', 'métricas', 'postgres', 'BRM', 'PDF', 'chat'],
    body: `# Agente de retención

## 1. Auditoría

Chat con tools: conocimiento CRM, schema Postgres del cliente (\`list_tables\`, \`describe_table\`, \`run_select\` **solo lectura**), guardar contexto.

API: \`POST /api/retencion/proyectos/[id]/agent-chat\`  
Config: \`GET|PATCH /api/retencion/proyectos/[id]/agent-config\`

## 2. Métricas reales

Antes de redactar el informe:

1. **Descubrir** SQL de agregación (escalares, series diarias, desgloses).
2. **Ejecutar** periodo actual + anterior.
3. Inyectar bloque \`REAL_METRICS\` al prompt.

UI: botón **Descubrir métricas**.  
API: \`GET|POST|PATCH /api/retencion/proyectos/[id]/metrics/discover\`

## 3. Informes mensuales

- Generar: \`POST /api/retencion/proyectos/[id]/monthly-report\` (\`audience: client|buffalo\`)
- Listar / editar: \`GET\` · \`PATCH\`
- Chat de edición en vivo: \`POST /api/retencion/…/informes/[reportId]/chat\`

El contenido usa **BRM** (markdown + \`:::kpi\`, \`:::chart\`, callouts, ROI…). Se renderiza con plantilla Buffalo y se exporta a PDF vía **impresión nativa del navegador** (texto real).

## Seguridad

Toda SQL del cliente pasa por \`assertReadOnlySelect\` + timeout + límite de filas. La URL de BD se guarda cifrada.
`,
  },
]
