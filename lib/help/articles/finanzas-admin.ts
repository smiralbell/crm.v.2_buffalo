import type { HelpArticle } from '../types'

export const ARTICLES_FINANZAS: HelpArticle[] = [
  {
    id: 'finanzas-hub',
    title: 'Finanzas: resumen, banco e IA',
    summary: 'Executive summary, sync bancario, ingresos, gastos y análisis',
    category: 'finanzas',
    order: 1,
    audience: ['admin'],
    tags: ['finanzas', 'banco', 'enable banking', 'MRR', 'gastos', 'ingresos'],
    body: `# Finanzas (admin)

Hub: \`/finances\`

## Subáreas UI

| Ruta | Contenido |
|------|-----------|
| \`/finances\` | Resumen ejecutivo, gráficos |
| \`/finances/incomes\` | Ingresos |
| \`/finances/expenses\` · \`…/manual/new\` | Gastos |
| \`/finances/results\` | Resultados / P&L |
| \`/finances/taxes\` | Impuestos |

## APIs clave

- Resumen: \`GET /api/finance/executive-summary\`
- Transacciones: \`/api/finance/transactions\`, \`/recent-transactions\`
- IA: \`/api/finance/ai-analysis\`, \`expenses-ai-analysis\`, \`incomes-ai-analysis\`
- CRUD: \`/api/finances/incomes\`, \`/expenses\`, \`/expenses/fixed\`, \`/salaries\`, \`/settings\`
- Banco: \`GET /api/bank/connection-status\`, \`POST /api/bank/sync\`

## Enable Banking

Conecta la cuenta bancaria (OAuth). Variables: \`ENABLEBANKING_APP_ID\`, \`ENABLEBANKING_PRIVATE_KEY\`, \`ENABLEBANKING_REDIRECT_URL\`, etc.

Tras conectar, **Sync** importa movimientos para conciliar ingresos/gastos.
`,
  },
  {
    id: 'facturas-cliente',
    title: 'Facturas a cliente',
    summary: 'Facturación Buffalo → cliente, recurrentes y Drive',
    category: 'finanzas',
    order: 2,
    audience: ['admin'],
    tags: ['facturas', 'invoices', 'recurrentes', 'cliente'],
    body: `# Facturas cliente

Rutas: \`/invoices\`, \`/invoices/new\`, \`/invoices/[id]\`, edit · Recurrentes: \`/invoices/recurring\`

## APIs

- \`GET|POST /api/invoices\` · \`/api/invoices/[id]\`
- \`/api/invoices/export\` · \`/send-to-drive\`
- Recurrentes: \`/api/invoices/recurring\`, \`/[id]\`, \`/[id]/generate\`

Las facturas cliente son del negocio Buffalo (setup + mensualidades). No confundir con facturas freelance de developers/comerciales.
`,
  },
  {
    id: 'facturas-freelance',
    title: 'Facturas freelance (developer / comercial)',
    summary: 'Cómo emitir facturas a Buffalo desde el panel freelance',
    category: 'finanzas',
    order: 3,
    audience: ['developer', 'comercial', 'admin'],
    tags: ['freelance', 'facturas', 'developer', 'pdf'],
    body: `# Facturas freelance

Rutas: \`/developer/facturas\`, \`/developer/facturas/nueva\`, \`/developer/facturas/[id]\`

Disponible para **developer** y **comercial**.

## Flujo

1. Nueva factura → datos fiscales, líneas, periodo.
2. Guardar → listado.
3. Descargar PDF si está disponible.

APIs: \`/api/developer/invoices\`, \`/[id]\`, \`/[id]/pdf\` · Dashboard: \`GET /api/developer/dashboard\`
`,
  },
]

export const ARTICLES_ADMIN: HelpArticle[] = [
  {
    id: 'usuarios',
    title: 'Usuarios y asignaciones',
    summary: 'Alta de developers/comerciales y asignación a proyectos',
    category: 'admin',
    order: 1,
    audience: ['admin'],
    tags: ['usuarios', 'crm_users', 'asignaciones', 'developers'],
    body: `# Usuarios

Rutas: \`/usuarios\`, \`/usuarios/[id]\` (solo admin)

## APIs

- \`GET|POST /api/users\` · \`/api/users/[id]\`
- \`GET /api/users/developers\` · \`/users/[id]/detail\`
- Asignaciones: \`/api/users/[id]/assignments\`
- Team: \`GET|POST /api/team-members\`

Al crear un usuario eliges rol (\`admin\` | \`developer\` | \`comercial\`). Los developers deben estar asignados a proyectos para ver trabajo en ENG 3 / tickets / retención.
`,
  },
  {
    id: 'calendario-analisis-checklist',
    title: 'Calendario, Análisis IA y Checklist',
    summary: 'Google Calendar, informes de empresa con IA y checklist operativo',
    category: 'admin',
    order: 2,
    audience: ['admin'],
    tags: ['calendario', 'análisis', 'checklist', 'google', 'IA'],
    body: `# Herramientas admin

## Calendario

\`/calendario\` — reuniones vinculadas a Google Calendar.

Integración: \`/api/integrations/google/*\` (connect, callback, disconnect, status, events, event-notes).

## Análisis IA

\`/analisis\` — informes cuantitativos de toda la empresa (OpenRouter + snapshot SQL).  
API: \`GET|POST /api/analisis/ai-analysis\`

La guía operativa larga está en \`docs/CRM_GUIA_ANALISIS_IA.md\` (también resumida en este Centro de ayuda).

## Checklist

\`/checklist\` — tareas internas del equipo.  
API: \`GET|POST /api/checklist\` · \`/api/checklist/[id]\`
`,
  },
  {
    id: 'dashboard',
    title: 'Dashboard admin',
    summary: 'Vista de KPIs globales al entrar como admin',
    category: 'admin',
    order: 3,
    audience: ['admin'],
    tags: ['dashboard', 'KPIs', 'home'],
    body: `# Dashboard

Ruta: \`/dashboard\`

Resumen de leads, pipelines, facturas e ingresos. Es el punto de entrada del admin tras el login.

Healthcheck de despliegue (sin UI): \`GET /api/health\`.
`,
  },
]
