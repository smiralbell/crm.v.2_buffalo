import type { HelpCategory } from './types'

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'inicio',
    label: 'Inicio y roles',
    description: 'Cómo entrar, qué ve cada rol y el modelo de negocio Buffalo',
    order: 1,
  },
  {
    id: 'eng1',
    label: 'ENG 1 · Marketing',
    description: 'Captación: web, email, cold call, Meta y Google Ads',
    order: 2,
  },
  {
    id: 'comercial',
    label: 'Comercial y cold calling',
    description: 'Campañas, llamadas, pipeline, reuniones y demos',
    order: 3,
  },
  {
    id: 'leads',
    label: 'Leads, contactos y pipelines',
    description: 'CRM comercial: fichas, embudos Kanban y estados',
    order: 4,
  },
  {
    id: 'eng2',
    label: 'ENG 2 · Onboarding y demos',
    description: 'Configurar el proyecto, propuesta y demos WhatsApp/voz',
    order: 5,
  },
  {
    id: 'eng3',
    label: 'ENG 3 · Proyectos y tickets',
    description: 'Ejecución: tareas, developers, documentos y soporte',
    order: 6,
  },
  {
    id: 'eng4',
    label: 'ENG 4 · Retención',
    description: 'Mensualidad, agente de auditoría e informes Buffalo',
    order: 7,
  },
  {
    id: 'finanzas',
    label: 'Finanzas y facturas',
    description: 'Banco, ingresos, gastos, facturas cliente y freelance',
    order: 8,
  },
  {
    id: 'admin',
    label: 'Admin, calendario y análisis',
    description: 'Usuarios, checklist, calendario Google y Análisis IA',
    order: 9,
  },
  {
    id: 'api',
    label: 'API y webhooks',
    description: 'Referencia de endpoints, autenticación e integraciones',
    order: 10,
  },
  {
    id: 'integraciones',
    label: 'Integraciones y entorno',
    description: 'Google, Cal.com, Wasender, Retell, banco y variables',
    order: 11,
  },
]
