import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { buildCrmCompanySnapshot } from '@/lib/analisis/snapshot'
import { buildExecutiveSummary } from '@/lib/finance/executive-summary'
import { getDefaultPeriodRange } from '@/lib/finance/period-presets'
import { DEFAULT_CRM_ASSISTANT_PROMPT } from './crm-assistant-prompt'

export { DEFAULT_CRM_ASSISTANT_PROMPT }

export type CrmDomain =
  | 'overview'
  | 'finance'
  | 'comercial'
  | 'proyectos'
  | 'ops'
  | 'marketing'
  | 'cliente'

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.warn(`[crm-assistant] ${label}:`, e instanceof Error ? e.message : e)
    return fallback
  }
}

export async function searchLeads(q: string, limit = 8) {
  const term = `%${q.trim()}%`
  if (q.trim().length < 2) return []
  return safe(
    'searchLeads',
    () =>
      prisma.$queryRaw<
        {
          id: number
          nombre: string | null
          empresa: string | null
          email: string | null
          telefono: string | null
          estado: string | null
          valor: number | null
        }[]
      >`
        SELECT l.id, c.nombre, c.empresa, c.email, c.telefono, l.estado, l.valor::float8 AS valor
        FROM leads l
        INNER JOIN contacts c ON c.id = l.contact_id
        WHERE c.nombre ILIKE ${term}
           OR c.empresa ILIKE ${term}
           OR c.email ILIKE ${term}
           OR c.telefono ILIKE ${term}
           OR COALESCE(l.configuracion, '') ILIKE ${term}
           OR COALESCE(l.notas, '') ILIKE ${term}
        ORDER BY l.updated_at DESC NULLS LAST, l.id DESC
        LIMIT ${limit}
      `,
    []
  )
}

export async function searchProyectos(q: string, limit = 8) {
  const term = `%${q.trim()}%`
  if (q.trim().length < 2) return []
  return safe(
    'searchProyectos',
    () =>
      prisma.$queryRaw<
        {
          id: string
          name: string
          status: string
          service_type: string
          setup_fee_eur: number | null
          monthly_fee_eur: number | null
          lead_id: number | null
          es_buffalo: boolean
        }[]
      >`
        SELECT p.id::text, p.name, p.status, p.service_type,
               p.setup_fee_eur::float8 AS setup_fee_eur,
               p.monthly_fee_eur::float8 AS monthly_fee_eur,
               p.lead_id, p.es_buffalo
        FROM proyectos p
        WHERE p.name ILIKE ${term}
           OR p.service_type ILIKE ${term}
           OR COALESCE(p.status, '') ILIKE ${term}
        ORDER BY p.updated_at DESC NULLS LAST
        LIMIT ${limit}
      `,
    []
  )
}

export async function searchContacts(q: string, limit = 8) {
  const term = `%${q.trim()}%`
  if (q.trim().length < 2) return []
  return safe(
    'searchContacts',
    () =>
      prisma.$queryRaw<
        {
          id: number
          nombre: string | null
          email: string | null
          telefono: string | null
          empresa: string | null
        }[]
      >`
        SELECT id, nombre, email, telefono, empresa
        FROM contacts
        WHERE nombre ILIKE ${term}
           OR email ILIKE ${term}
           OR telefono ILIKE ${term}
           OR empresa ILIKE ${term}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT ${limit}
      `,
    []
  )
}

export async function searchTickets(q: string, limit = 8) {
  const term = `%${q.trim()}%`
  if (q.trim().length < 2) return []
  return safe(
    'searchTickets',
    () =>
      prisma.$queryRaw<
        {
          id: string
          title: string
          status: string
          priority: string
          project_name: string | null
        }[]
      >`
        SELECT t.id::text, t.title, t.status, t.priority, p.name AS project_name
        FROM tickets t
        LEFT JOIN proyectos p ON p.id = t.project_id
        WHERE t.title ILIKE ${term}
           OR COALESCE(t.description, '') ILIKE ${term}
           OR COALESCE(t.status, '') ILIKE ${term}
           OR COALESCE(t.reporter_name, '') ILIKE ${term}
           OR COALESCE(t.reporter_email, '') ILIKE ${term}
        ORDER BY t.updated_at DESC NULLS LAST
        LIMIT ${limit}
      `,
    []
  )
}

export async function getLeadDetail(leadId: number) {
  return safe(
    'getLeadDetail',
    async () => {
      const rows = await prisma.$queryRaw<
        {
          id: number
          estado: string | null
          valor: number | null
          origen_principal: string | null
          notas: string | null
          configuracion: string | null
          nombre: string | null
          empresa: string | null
          email: string | null
          telefono: string | null
          created_at: Date
          updated_at: Date
        }[]
      >`
        SELECT l.id, l.estado, l.valor::float8 AS valor, l.origen_principal, l.notas, l.configuracion,
               c.nombre, c.empresa, c.email, c.telefono, l.created_at, l.updated_at
        FROM leads l
        INNER JOIN contacts c ON c.id = l.contact_id
        WHERE l.id = ${leadId}
        LIMIT 1
      `
      const lead = rows[0]
      if (!lead) return null
      const proyectos = await prisma.$queryRaw<
        { id: string; name: string; status: string; monthly_fee_eur: number | null }[]
      >`
        SELECT id::text, name, status, monthly_fee_eur::float8 AS monthly_fee_eur
        FROM proyectos WHERE lead_id = ${leadId}
        ORDER BY created_at DESC LIMIT 10
      `
      return {
        ...lead,
        // No volcar configuracion completa (base64 enorme)
        configuracion_presente: Boolean(lead.configuracion && lead.configuracion.length > 0),
        configuracion: undefined,
        proyectos,
      }
    },
    null
  )
}

export async function getFinanceBrief() {
  return safe(
    'getFinanceBrief',
    async () => {
      const period = getDefaultPeriodRange()
      const exec = await buildExecutiveSummary(period)
      return {
        period_label: exec.period_label,
        kpis: exec.kpis,
        alerts: exec.alerts.slice(0, 6).map((a) => ({
          priority: a.priority,
          title: a.title,
          message: a.message,
        })),
        mrr_by_client: exec.mrr_by_client.slice(0, 12),
        pending_invoices: exec.pending_invoices.slice(0, 8),
      }
    },
    null
  )
}

export async function getBankRecent(limit = 12) {
  return safe(
    'getBankRecent',
    async () => {
      const r = await query<{
        date: string
        amount: string
        description: string
        balance: string | null
      }>(
        `SELECT date::text AS date, amount::text, description, balance::text
         FROM bank_transactions
         ORDER BY date DESC, created_at DESC
         LIMIT $1`,
        [limit]
      )
      return r.rows.map((row) => ({
        date: row.date,
        amount: Number(row.amount),
        description: row.description,
        balance: row.balance != null ? Number(row.balance) : null,
      }))
    },
    []
  )
}

export const CRM_ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'run_domain_agent',
      description:
        'SUBAGENTE preferido. Ejecuta en paralelo uno o varios dominios y devuelve datos listos. domains: overview|finance|comercial|proyectos|ops|marketing|cliente. Si domains incluye cliente, pasa entity_query con el nombre/empresa.',
      parameters: {
        type: 'object',
        properties: {
          domains: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'overview',
                'finance',
                'comercial',
                'proyectos',
                'ops',
                'marketing',
                'cliente',
              ],
            },
            description: 'Dominios a consultar en paralelo',
          },
          entity_query: {
            type: 'string',
            description: 'Nombre/empresa/email para domain cliente',
          },
        },
        required: ['domains'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_entity',
      description:
        'Búsqueda cruzada rápida de un cliente/empresa/persona en leads, contacts, proyectos, tickets y facturas a la vez.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_company_snapshot',
      description: 'Snapshot cuantitativo global (alternativa a run_domain_agent overview).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_finance_brief',
      description: 'Solo finanzas ejecutivas (MRR, caja, alertas, pendientes).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_bank_recent',
      description: 'Últimos movimientos bank_transactions.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_leads',
      description: 'Busca en leads JOIN contacts (nombre, empresa, email, teléfono, notas).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_lead_detail',
      description: 'Detalle lead por id + proyectos ligados.',
      parameters: {
        type: 'object',
        properties: { lead_id: { type: 'number' } },
        required: ['lead_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_proyectos',
      description: 'Busca proyectos por nombre/tipo/status.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_proyecto_detail',
      description: 'Detalle proyecto uuid + tickets + tareas por status.',
      parameters: {
        type: 'object',
        properties: { proyecto_id: { type: 'string' } },
        required: ['proyecto_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_contacts',
      description: 'Busca contacts.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_tickets',
      description: 'Busca tickets por título/descripcion/status/reporter.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_invoices',
      description: 'Busca facturas por client_name o invoice_number (BUF-…).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_pipeline_brief',
      description: 'Valor y conteo de pipeline_cards por stage (Kanban, deleted_at null).',
      parameters: { type: 'object', properties: {} },
    },
  },
]

export async function executeCrmAssistantTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const {
    runDomainAgents,
    lookupEntity,
    getProyectoDetail,
    searchInvoices,
    getPipelineBrief,
  } = await import('./crm-assistant-subagents')

  switch (name) {
    case 'run_domain_agent': {
      const domains = (Array.isArray(args.domains) ? args.domains : ['overview']) as CrmDomain[]
      return runDomainAgents(domains, String(args.entity_query || ''))
    }
    case 'lookup_entity':
      return lookupEntity(String(args.query || ''))
    case 'get_company_snapshot':
      return buildCrmCompanySnapshot()
    case 'get_finance_brief':
      return getFinanceBrief()
    case 'get_bank_recent':
      return getBankRecent(Math.min(20, Number(args.limit) || 12))
    case 'search_leads':
      return searchLeads(String(args.query || ''))
    case 'get_lead_detail':
      return getLeadDetail(Number(args.lead_id))
    case 'search_proyectos':
      return searchProyectos(String(args.query || ''))
    case 'get_proyecto_detail':
      return getProyectoDetail(String(args.proyecto_id || ''))
    case 'search_contacts':
      return searchContacts(String(args.query || ''))
    case 'search_tickets':
      return searchTickets(String(args.query || ''))
    case 'search_invoices':
      return searchInvoices(String(args.query || ''))
    case 'get_pipeline_brief':
      return getPipelineBrief()
    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}
