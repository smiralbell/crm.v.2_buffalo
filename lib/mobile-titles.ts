/** Título de la cabecera móvil según la ruta (pages router: `router.pathname`). */

const SECTIONS: [string, string][] = [
  ['/dashboard', 'Inicio'],
  ['/alertas', 'Alertas'],
  ['/leads/reuniones', 'Reuniones'],
  ['/leads/analytics', 'Analítica de leads'],
  ['/leads/new', 'Nuevo lead'],
  ['/leads', 'Leads'],
  ['/contacts', 'Contactos'],
  ['/pipelines/new', 'Nuevo pipeline'],
  ['/pipelines', 'Pipelines'],
  ['/finances/expenses', 'Gastos'],
  ['/finances/incomes', 'Ingresos'],
  ['/finances/results', 'Resultados'],
  ['/finances/taxes', 'Impuestos'],
  ['/finances', 'Finanzas'],
  ['/invoices/recurring', 'Recurrentes'],
  ['/invoices/new', 'Nueva factura'],
  ['/invoices', 'Facturas'],
  ['/gestion-proyecto', 'Proyectos'],
  ['/tickets', 'Tickets'],
  ['/retencion', 'Retención'],
  ['/marketing', 'Marketing'],
  ['/onboarding', 'Onboarding'],
  ['/demos', 'Demos'],
  ['/blog', 'Blog'],
  ['/calendario', 'Calendario'],
  ['/analisis', 'Análisis IA'],
  ['/checklist', 'Checklist'],
  ['/usuarios', 'Usuarios'],
  ['/developer/facturas', 'Mis facturas'],
  ['/developer', 'Inicio'],
  ['/comercial/campanas', 'Campañas'],
  ['/comercial/pipeline', 'Pipeline'],
  ['/comercial/reuniones', 'Reuniones'],
  ['/comercial/fireflies', 'Fireflies'],
  ['/comercial/llamar-mas-tarde', 'Llamar más tarde'],
  ['/comercial/objeciones', 'Objeciones'],
  ['/comercial/duplicados', 'Duplicados'],
  ['/comercial/preparar-demos', 'Preparar demos'],
  ['/comercial', 'Inicio'],
]

/** Pantallas raíz de cada sección: sin flecha de volver. */
const ROOTS = new Set([
  '/dashboard',
  '/alertas',
  '/leads',
  '/pipelines',
  '/finances',
  '/invoices',
  '/gestion-proyecto',
  '/tickets',
  '/retencion',
  '/marketing',
  '/onboarding',
  '/demos',
  '/blog',
  '/calendario',
  '/analisis',
  '/checklist',
  '/usuarios',
  '/developer',
  '/comercial',
])

export function mobileTitle(pathname: string): string {
  for (const [prefix, title] of SECTIONS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title
  }
  return 'Buffalo CRM'
}

/** Detalle o subpantalla → la cabecera muestra «volver». */
export function mobileHasBack(pathname: string): boolean {
  if (ROOTS.has(pathname)) return false
  if (pathname.startsWith('/comercial/') && pathname.split('/').length === 3) return false
  return pathname.split('/').filter(Boolean).length > 1
}
