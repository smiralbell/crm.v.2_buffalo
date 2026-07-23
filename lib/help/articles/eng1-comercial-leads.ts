import type { HelpArticle } from '../types'

export const ARTICLES_ENG1: HelpArticle[] = [
  {
    id: 'marketing-hub',
    title: 'Marketing (ENG 1): hub y canales',
    summary: 'Pantalla /marketing y pestañas de métricas por canal',
    category: 'eng1',
    order: 1,
    audience: ['admin'],
    tags: ['marketing', 'ENG1', 'web', 'email', 'meta', 'google', 'instantly'],
    body: `# Marketing · ENG 1

Ruta: \`/marketing?tab=…\`

## Pestañas

| Tab | Contenido |
|-----|-----------|
| **global** | Vista agregada de captación |
| **web** | Formularios, calendario Cal.com, chat web |
| **email** | Outreach Instantly (métricas / logs) |
| **coldcalling** | Puente al mundo cold call |
| **meta** | Meta Ads (métricas) |
| **google** | Google Ads (métricas) |

## Subpáginas web

- \`/marketing/web/formularios\` — envíos de formularios web
- \`/marketing/web/calendario\` — reservas Cal.com
- \`/marketing/web/chat\` — métricas de chat web

## APIs útiles

- \`GET /api/marketing/metrics\` — métricas globales
- \`GET /api/marketing/web-metrics\` · \`/web-dashboard\`
- \`GET|PATCH /api/marketing/web-form-submissions\`
- \`GET /api/marketing/cal-bookings\`
- Webhook Cal.com: \`POST /api/webhooks/calcom\`
- Instantly: \`POST /api/webhooks/instantly\` · logs en \`/api/webhooks/instantly/logs\`

## Flujo típico

Visitante web → formulario o Cal.com → lead/pipeline WEB → Onboarding si convierte.
`,
  },
]

export const ARTICLES_COMERCIAL: HelpArticle[] = [
  {
    id: 'comercial-dia',
    title: 'Día a día del comercial',
    summary: 'Campañas, llamar ahora, pipeline, reuniones y callbacks',
    category: 'comercial',
    order: 1,
    audience: ['admin', 'comercial'],
    tags: ['comercial', 'coldcall', 'llamadas', 'campañas', 'reuniones'],
    body: `# Panel comercial

Home: \`/comercial\`

## Flujo recomendado

1. Abre **Campañas** (\`/comercial/campanas\`) y elige/activa una.
2. Pulsa **Llamar ahora** (recuerda la última campaña) → sesión de llamadas.
3. Tras la llamada: convertir a lead, agendar reunión, o **Llamar más tarde**.
4. Revisa **Pipeline** y **Reuniones**.
5. Antes de la demo: **Preparar demos**.
6. Consulta **Objeciones** y **Duplicados** cuando haga falta.

## Rutas

| Pantalla | Ruta |
|----------|------|
| Inicio | \`/comercial\` |
| Campañas | \`/comercial/campanas\` |
| Pipeline | \`/comercial/pipeline\` |
| Reuniones | \`/comercial/reuniones\` |
| Callbacks | \`/comercial/llamar-mas-tarde\` |
| Objeciones | \`/comercial/objeciones\` |
| Duplicados | \`/comercial/duplicados\` |
| Preparar demos | \`/comercial/preparar-demos\` |
| Llamadas (detalle) | \`/coldcalling/campanas/[id]/llamadas\` |

## APIs cold call (resumen)

- Campañas: \`/api/coldcall/campaigns\`, \`…/[id]\`, script, mapping, presentation, import
- Leads de campaña: \`…/leads\`, \`…/leads/[leadId]\`, call-session
- Prospectos: \`/api/coldcall/prospects\`
- Operativa: \`POST /calls\`, \`/convert-to-lead\`, \`/schedule-meeting\`, \`/search-places\`
- UX ventas: \`/callbacks\`, \`/meetings\`, \`/duplicates\`, \`/my-objections\`
- Dashboards: \`/dashboard\`, \`/team-dashboard\`, \`/metrics\`

Solo **admin** y **comercial** tienen acceso a estas APIs.
`,
  },
  {
    id: 'coldcall-campanas',
    title: 'Campañas de cold calling',
    summary: 'Crear campaña, importar leads, script, mapping y sesión de llamadas',
    category: 'comercial',
    order: 2,
    audience: ['admin', 'comercial'],
    tags: ['campaña', 'import', 'script', 'mapping', 'llamadas'],
    body: `# Campañas cold calling

## Qué es una campaña

Una lista de prospectos/leads con script, presentación, mapeo de columnas (si importas CSV) y métricas de llamadas.

## Pasos de configuración (admin)

1. Crear campaña (\`POST /api/coldcall/campaigns\`).
2. **Import** CSV con preview (\`…/import\`, \`…/import/preview\`).
3. Definir **mapping** de columnas.
4. Editar **script** y **presentation**.
5. Lanzar sesión de llamadas (\`call-session\`).

## Durante la llamada

- Registrar resultado con \`POST /api/coldcall/calls\`.
- Convertir a lead CRM: \`POST /api/coldcall/convert-to-lead\`.
- Agendar reunión: \`POST /api/coldcall/schedule-meeting\` (calendario/Gmail según config).
- Buscar sitios (Places): \`POST /api/coldcall/search-places\` (requiere \`GOOGLE_PLACES_API_KEY\`).
`,
  },
]

export const ARTICLES_LEADS: HelpArticle[] = [
  {
    id: 'leads-contactos',
    title: 'Leads y contactos',
    summary: 'CRUD de leads, ficha, estados y relación con contactos',
    category: 'leads',
    order: 1,
    audience: ['admin'],
    tags: ['leads', 'contactos', 'CRM', 'estado'],
    body: `# Leads y contactos

## Leads

- Listado: \`/leads\`
- Nuevo: \`/leads/new\`
- Ficha: \`/leads/[id]\` · Editar: \`/leads/[id]/edit\`

APIs: \`GET|POST /api/leads\` · \`/api/leads/[id]\`

El **estado del lead** es independiente del tablero Kanban. Úsalo como etiqueta comercial; el progreso visual suele vivir en **Pipelines**.

## Contactos

- \`/contacts\`, \`/contacts/new\`, \`/contacts/[id]\`
- APIs: \`/api/contacts\`, \`/api/contacts/[id]\`, sugerencias \`/api/contacts/suggest\`

Un contacto puede alimentar varios leads. En Onboarding el lead lleva la **configuración** del proyecto.
`,
  },
  {
    id: 'pipelines',
    title: 'Pipelines (Kanban)',
    summary: 'Tableros, etapas, tarjetas y pipelines de canal (WEB, Cold Call, Global)',
    category: 'leads',
    order: 2,
    audience: ['admin', 'comercial'],
    tags: ['pipeline', 'kanban', 'stages', 'cards', 'embudo'],
    body: `# Pipelines

Rutas: \`/pipelines\`, \`/pipelines/new\`, \`/pipelines/[id]\`

## Conceptos

- **Pipeline**: un tablero (p. ej. WEB, Cold Calling, Global Buffalo).
- **Stage**: columna.
- **Card**: tarjeta (suele enlazar lead/contacto).

## APIs

- \`GET|POST /api/pipelines\`
- \`GET… /api/pipelines/[id]\`
- \`POST /api/pipelines/[id]/stages\`
- \`POST /api/pipelines/[id]/cards\` · \`…/cards/[cardId]\`
- Lookup: \`GET /api/pipelines/lookup\`

## Variables de entorno típicas

- \`GLOBAL_PIPELINE_ID\` / \`BUFFALO_GLOBAL_PIPELINE_ID\`
- \`WEB_PIPELINE_ID\`
- \`COLDCALL_PIPELINE_ID\`

El comercial usa sobre todo el pipeline de cold call vía \`/comercial/pipeline\`.
`,
  },
]
