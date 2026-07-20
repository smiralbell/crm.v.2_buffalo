import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { buildCrmCompanySnapshot } from '@/lib/analisis/snapshot'
import { buildExecutiveSummary } from '@/lib/finance/executive-summary'
import { getDefaultPeriodRange } from '@/lib/finance/period-presets'

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
        SELECT l.id,
               c.nombre,
               c.empresa,
               c.email,
               c.telefono,
               l.estado,
               l.valor::float8 AS valor
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
               p.lead_id,
               p.es_buffalo
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
               c.nombre, c.empresa, c.email, c.telefono,
               l.created_at, l.updated_at
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
      return { ...lead, proyectos }
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

export type CrmAssistantToolName =
  | 'get_company_snapshot'
  | 'search_leads'
  | 'search_proyectos'
  | 'search_contacts'
  | 'search_tickets'
  | 'get_lead_detail'
  | 'get_finance_brief'
  | 'get_bank_recent'

export const CRM_ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_company_snapshot',
      description:
        'Snapshot cuantitativo del CRM: leads, proyectos Buffalo, tickets, finanzas del mes, marketing. Úsalo para preguntas generales o de overview.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_leads',
      description: 'Busca leads por nombre, empresa, email o teléfono.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto a buscar' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_proyectos',
      description: 'Busca proyectos por nombre, tipo de servicio o estado.',
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
      name: 'search_contacts',
      description: 'Busca contactos del CRM.',
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
      description: 'Busca tickets de soporte/operaciones.',
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
      description: 'Detalle de un lead por id (tras search_leads).',
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
      name: 'get_finance_brief',
      description:
        'Resumen ejecutivo de finanzas: MRR, caja, facturado/cobrado, alertas, pendientes.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_bank_recent',
      description: 'Últimos movimientos bancarios del extracto.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Máx 20, default 12' },
        },
      },
    },
  },
]

export async function executeCrmAssistantTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name as CrmAssistantToolName) {
    case 'get_company_snapshot':
      return buildCrmCompanySnapshot()
    case 'search_leads':
      return searchLeads(String(args.query || ''))
    case 'search_proyectos':
      return searchProyectos(String(args.query || ''))
    case 'search_contacts':
      return searchContacts(String(args.query || ''))
    case 'search_tickets':
      return searchTickets(String(args.query || ''))
    case 'get_lead_detail':
      return getLeadDetail(Number(args.lead_id))
    case 'get_finance_brief':
      return getFinanceBrief()
    case 'get_bank_recent':
      return getBankRecent(Math.min(20, Number(args.limit) || 12))
    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}

export const DEFAULT_CRM_ASSISTANT_PROMPT = `Eres el asistente personal interno de Buffalo AI. Tienes acceso al CRM en tiempo real mediante herramientas.

Quién eres:
- Ayudas al equipo (CEO/comercial/ops) por WhatsApp.
- Respondes con datos reales del CRM. Si no encuentras algo, dilo y sugiere qué mirar en la app.
- No inventes cifras, clientes ni estados.

Cómo trabajar:
1) Para preguntas generales (cómo vamos, resumen, KPIs) usa get_company_snapshot y/o get_finance_brief.
2) Si preguntan por un cliente, empresa o persona: search_leads / search_contacts / search_proyectos y luego get_lead_detail si hace falta.
3) Para tickets o incidencias: search_tickets.
4) Para movimientos de banco: get_bank_recent.
5) Combina varias herramientas si hace falta antes de responder.

Estilo WhatsApp:
- Español claro, conciso, profesional pero cercano.
- SIN markdown ni asteriscos.
- Párrafos cortos separados por línea en blanco.
- Incluye números concretos cuando los tengas.
- Si hay riesgo o alerta, menciónalo primero.`
