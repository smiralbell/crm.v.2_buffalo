import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { buildCrmCompanySnapshot } from '@/lib/analisis/snapshot'
import { buildExecutiveSummary } from '@/lib/finance/executive-summary'
import { getDefaultPeriodRange } from '@/lib/finance/period-presets'
import {
  getBankRecent,
  getLeadDetail,
  searchContacts,
  searchLeads,
  searchProyectos,
  searchTickets,
  type CrmDomain,
} from './crm-assistant-tools'

export type { CrmDomain }

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.warn(`[crm-subagent:${label}]`, e instanceof Error ? e.message : e)
    return fallback
  }
}

async function runFinanceAgent() {
  const period = getDefaultPeriodRange()
  const [exec, bank, unmatched] = await Promise.all([
    buildExecutiveSummary(period),
    getBankRecent(10),
    safe(
      'unmatchedInvoices',
      () =>
        prisma.$queryRaw<{ n: number; total_eur: number }[]>`
          SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::float8 AS total_eur
          FROM invoices
          WHERE deleted_at IS NULL AND status = 'sent'
            AND invoice_source = 'client'
            AND bank_transaction_id IS NULL
        `,
      [{ n: 0, total_eur: 0 }]
    ),
  ])
  return {
    domain: 'finance' as const,
    how_to_read: {
      mrr_dashboard: 'Solo cobros banco con is_recurring_income=true',
      mrr_cartera: 'Σ proyectos.monthly_fee_eur en cartera abierta (puede diferir)',
      facturado: 'invoices.total status=sent',
      cobrado: 'fecha de bank_transactions del vínculo',
      caja: 'último balance en bank_transactions',
    },
    period_label: exec.period_label,
    kpis: exec.kpis,
    alerts: exec.alerts.slice(0, 8),
    mrr_by_client: exec.mrr_by_client.slice(0, 15),
    pending_invoices: exec.pending_invoices.slice(0, 10),
    invoices_sin_cobro_banco: unmatched[0],
    bank_recent: bank,
  }
}

async function runComercialAgent() {
  const [leadsByEstado, pipeline, hotLeads, configured] = await Promise.all([
    safe(
      'leadsByEstado',
      () =>
        prisma.$queryRaw<{ estado: string; n: number; valor_eur: number }[]>`
          SELECT COALESCE(estado,'sin_estado') AS estado,
                 COUNT(*)::int AS n,
                 COALESCE(SUM(valor),0)::float8 AS valor_eur
          FROM leads
          GROUP BY 1 ORDER BY n DESC
        `,
      []
    ),
    safe(
      'pipeline',
      () =>
        prisma.$queryRaw<{ stage: string; n: number; amount_eur: number }[]>`
          SELECT stage, COUNT(*)::int AS n, COALESCE(SUM(amount),0)::float8 AS amount_eur
          FROM pipeline_cards
          WHERE deleted_at IS NULL
          GROUP BY 1 ORDER BY amount_eur DESC
          LIMIT 25
        `,
      []
    ),
    safe(
      'hotLeads',
      () =>
        prisma.$queryRaw<
          {
            id: number
            nombre: string | null
            empresa: string | null
            estado: string | null
            valor: number | null
          }[]
        >`
          SELECT l.id, c.nombre, c.empresa, l.estado, l.valor::float8 AS valor
          FROM leads l
          JOIN contacts c ON c.id = l.contact_id
          WHERE l.estado IN ('caliente','reunion','propuesta','negociando')
          ORDER BY l.updated_at DESC NULLS LAST
          LIMIT 12
        `,
      []
    ),
    safe(
      'configured',
      () =>
        prisma.$queryRaw<{ total: number; configurados: number }[]>`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (
                   WHERE configuracion IS NOT NULL AND configuracion <> ''
                 )::int AS configurados
          FROM leads
        `,
      [{ total: 0, configurados: 0 }]
    ),
  ])
  return {
    domain: 'comercial' as const,
    note: 'leads.estado ≠ pipeline_cards.stage — son embudos distintos',
    leads_by_estado: leadsByEstado,
    leads_configurados: configured[0],
    pipeline_by_stage: pipeline,
    leads_calientes_recientes: hotLeads,
  }
}

async function runProyectosAgent() {
  const [open, byStatus, retention, churned] = await Promise.all([
    safe(
      'openPortfolio',
      () =>
        prisma.$queryRaw<
          {
            id: string
            name: string
            status: string
            service_type: string
            setup_fee_eur: number | null
            monthly_fee_eur: number | null
            has_mensualidad: boolean
            fecha_inicio_real: string | null
            fecha_fin_real: string | null
          }[]
        >`
          SELECT p.id::text, p.name, p.status, p.service_type,
                 p.setup_fee_eur::float8 AS setup_fee_eur,
                 p.monthly_fee_eur::float8 AS monthly_fee_eur,
                 p.has_mensualidad,
                 p.fecha_inicio_real::text, p.fecha_fin_real::text
          FROM proyectos p
          INNER JOIN leads l ON l.id = p.lead_id
          WHERE p.es_buffalo = TRUE
            AND p.status IN ('development','active','paused')
            AND l.configuracion IS NOT NULL AND l.configuracion <> ''
          ORDER BY p.updated_at DESC
          LIMIT 40
        `,
      []
    ),
    safe(
      'byStatus',
      () =>
        prisma.$queryRaw<
          { status: string; n: number; setup_eur: number; mrr_eur: number }[]
        >`
          SELECT p.status, COUNT(*)::int AS n,
                 COALESCE(SUM(p.setup_fee_eur),0)::float8 AS setup_eur,
                 COALESCE(SUM(p.monthly_fee_eur),0)::float8 AS mrr_eur
          FROM proyectos p
          INNER JOIN leads l ON l.id = p.lead_id
          WHERE p.es_buffalo = TRUE
            AND p.status IN ('development','active','paused')
            AND l.configuracion IS NOT NULL AND l.configuracion <> ''
          GROUP BY 1
        `,
      []
    ),
    safe(
      'retention',
      () =>
        prisma.$queryRaw<{ n: number; mrr_eur: number }[]>`
          SELECT COUNT(*)::int AS n,
                 COALESCE(SUM(monthly_fee_eur),0)::float8 AS mrr_eur
          FROM proyectos
          WHERE has_mensualidad = TRUE AND status <> 'churned'
        `,
      [{ n: 0, mrr_eur: 0 }]
    ),
    safe(
      'churned30',
      () =>
        prisma.$queryRaw<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM proyectos
          WHERE status = 'churned'
            AND updated_at >= NOW() - INTERVAL '30 days'
        `,
      [{ n: 0 }]
    ),
  ])

  const setup = open.reduce((s, p) => s + Number(p.setup_fee_eur || 0), 0)
  const mrr = open.reduce((s, p) => s + Number(p.monthly_fee_eur || 0), 0)

  return {
    domain: 'proyectos' as const,
    filter:
      "es_buffalo AND status in (development,active,paused) AND lead.configuracion not empty",
    totals: {
      open_count: open.length,
      setup_eur: Math.round(setup * 100) / 100,
      mrr_cartera_eur: Math.round(mrr * 100) / 100,
      retention_count: retention[0]?.n ?? 0,
      retention_mrr_eur: retention[0]?.mrr_eur ?? 0,
      churned_30d: churned[0]?.n ?? 0,
    },
    by_status: byStatus,
    open_projects: open.slice(0, 25),
  }
}

async function runOpsAgent() {
  const [tickets, byPriority, byProject] = await Promise.all([
    safe(
      'openTickets',
      () =>
        prisma.$queryRaw<
          {
            id: string
            title: string
            status: string
            priority: string
            project_name: string | null
            created_at: string
          }[]
        >`
          SELECT t.id::text, t.title, t.status, t.priority, p.name AS project_name,
                 t.created_at::text
          FROM tickets t
          LEFT JOIN proyectos p ON p.id = t.project_id
          WHERE t.status IN ('open','in_progress')
          ORDER BY
            CASE t.priority
              WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3
            END,
            t.created_at ASC
          LIMIT 25
        `,
      []
    ),
    safe(
      'byPriority',
      () =>
        prisma.$queryRaw<{ priority: string; n: number }[]>`
          SELECT priority, COUNT(*)::int AS n
          FROM tickets
          WHERE status IN ('open','in_progress')
          GROUP BY 1
        `,
      []
    ),
    safe(
      'byProject',
      () =>
        prisma.$queryRaw<{ project_name: string; n: number }[]>`
          SELECT COALESCE(p.name,'(sin proyecto)') AS project_name, COUNT(*)::int AS n
          FROM tickets t
          LEFT JOIN proyectos p ON p.id = t.project_id
          WHERE t.status IN ('open','in_progress')
          GROUP BY 1 ORDER BY n DESC LIMIT 12
        `,
      []
    ),
  ])
  return {
    domain: 'ops' as const,
    open_count: tickets.length,
    by_priority: byPriority,
    by_project: byProject,
    open_tickets: tickets,
  }
}

async function runMarketingAgent() {
  const [coldcall, metrics] = await Promise.all([
    safe(
      'coldcall',
      () =>
        prisma.$queryRaw<
          {
            calls_30d: number
            meetings_30d: number
            interested_30d: number
            prospects_open: number
          }[]
        >`
          SELECT
            (SELECT COUNT(*)::int FROM coldcall_calls
              WHERE fecha >= NOW() - INTERVAL '30 days') AS calls_30d,
            (SELECT COUNT(*)::int FROM coldcall_calls
              WHERE fecha >= NOW() - INTERVAL '30 days'
                AND resultado = 'reunion_agendada') AS meetings_30d,
            (SELECT COUNT(*)::int FROM coldcall_calls
              WHERE fecha >= NOW() - INTERVAL '30 days'
                AND resultado = 'interesado') AS interested_30d,
            (SELECT COUNT(*)::int FROM coldcall_prospects
              WHERE stage IN ('nuevo','en_cola','volver_a_llamar','interesado_info_enviada')
                AND deleted_at IS NULL) AS prospects_open
        `,
      [{ calls_30d: 0, meetings_30d: 0, interested_30d: 0, prospects_open: 0 }]
    ),
    safe(
      'metrics',
      () =>
        prisma.$queryRaw<
          {
            channel: string
            period: string
            spend: number
            meetings_booked: number
            replies: number
          }[]
        >`
          SELECT channel, period,
                 COALESCE(spend,0)::float8 AS spend,
                 COALESCE(meetings_booked,0)::int AS meetings_booked,
                 COALESCE(replies,0)::int AS replies
          FROM marketing_metrics
          ORDER BY period DESC
          LIMIT 12
        `,
      []
    ),
  ])
  return {
    domain: 'marketing' as const,
    coldcall_30d: coldcall[0],
    marketing_metrics_recent: metrics,
  }
}

async function runClienteAgent(q: string) {
  const queryText = q.trim()
  if (queryText.length < 2) {
    return { domain: 'cliente' as const, error: 'query demasiado corta', query: queryText }
  }
  const [leads, contacts, proyectos, tickets, invoices] = await Promise.all([
    searchLeads(queryText, 8),
    searchContacts(queryText, 6),
    searchProyectos(queryText, 8),
    searchTickets(queryText, 8),
    safe(
      'invoices',
      () =>
        prisma.$queryRaw<
          {
            id: number
            invoice_number: string
            client_name: string
            total: number
            status: string
            issue_date: string
            linked_bank: boolean
          }[]
        >`
          SELECT id, invoice_number, client_name, total::float8 AS total, status,
                 issue_date::text, (bank_transaction_id IS NOT NULL) AS linked_bank
          FROM invoices
          WHERE deleted_at IS NULL
            AND (
              client_name ILIKE ${`%${queryText}%`}
              OR invoice_number ILIKE ${`%${queryText}%`}
            )
          ORDER BY issue_date DESC
          LIMIT 10
        `,
      []
    ),
  ])

  let lead_detail = null
  if (leads[0]?.id) {
    lead_detail = await getLeadDetail(leads[0].id)
  }

  return {
    domain: 'cliente' as const,
    query: queryText,
    leads,
    contacts,
    proyectos,
    tickets,
    invoices,
    lead_detail,
  }
}

async function runOverviewAgent() {
  const [snapshot, finance, proyectos, ops] = await Promise.all([
    buildCrmCompanySnapshot(),
    runFinanceAgent(),
    runProyectosAgent(),
    runOpsAgent(),
  ])
  return {
    domain: 'overview' as const,
    snapshot_kpis: {
      comercial: snapshot.comercial,
      proyectos: {
        open_count: snapshot.proyectos.open_count,
        open_setup_eur: snapshot.proyectos.open_setup_eur,
        open_mrr_eur: snapshot.proyectos.open_mrr_eur,
        retention_mrr_eur: snapshot.proyectos.retention_mrr_eur,
        churned_last_30d: snapshot.proyectos.churned_last_30d,
      },
      finanzas_mes: snapshot.finanzas,
      tickets: snapshot.operaciones.tickets_by_status,
      marketing: snapshot.marketing.coldcall_30d,
    },
    finance_alerts: finance.alerts,
    portfolio_totals: proyectos.totals,
    ops_open: ops.open_count,
  }
}

export async function runDomainAgents(
  domains: CrmDomain[],
  entityQuery?: string
): Promise<Record<string, unknown>> {
  const unique = Array.from(new Set(domains.length ? domains : (['overview'] as CrmDomain[])))
  const entries = await Promise.all(
    unique.map(async (d) => {
      switch (d) {
        case 'overview':
          return [d, await runOverviewAgent()] as const
        case 'finance':
          return [d, await runFinanceAgent()] as const
        case 'comercial':
          return [d, await runComercialAgent()] as const
        case 'proyectos':
          return [d, await runProyectosAgent()] as const
        case 'ops':
          return [d, await runOpsAgent()] as const
        case 'marketing':
          return [d, await runMarketingAgent()] as const
        case 'cliente':
          return [d, await runClienteAgent(entityQuery || '')] as const
        default:
          return [d, { error: 'dominio desconocido' }] as const
      }
    })
  )
  return Object.fromEntries(entries)
}

export async function lookupEntity(q: string) {
  return runClienteAgent(q)
}

export async function getProyectoDetail(proyectoId: string) {
  return safe(
    'proyectoDetail',
    async () => {
      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT p.id::text, p.name, p.status, p.service_type, p.es_buffalo,
               p.setup_fee_eur::float8 AS setup_fee_eur,
               p.monthly_fee_eur::float8 AS monthly_fee_eur,
               p.has_mensualidad, p.maint_plan,
               p.has_voz, p.has_chat, p.has_dash, p.has_pack,
               p.tiempo_previsto, p.fecha_inicio_real::text, p.fecha_fin_real::text,
               p.lead_id, p.retell_agent_id, p.twilio_number, p.whatsapp_number,
               c.nombre AS contact_nombre, c.empresa AS contact_empresa, c.email AS contact_email
        FROM proyectos p
        LEFT JOIN contacts c ON c.id = p.contact_id
        WHERE p.id = ${proyectoId}::uuid
        LIMIT 1
      `
      const p = rows[0]
      if (!p) return null
      const tickets = await searchTickets(String(p.name || ''), 8)
      const tasks = await prisma.$queryRaw<{ status: string; n: number }[]>`
        SELECT status, COUNT(*)::int AS n
        FROM project_dev_tasks
        WHERE project_id = ${proyectoId}::uuid
        GROUP BY 1
      `.catch(() => [] as { status: string; n: number }[])
      return { proyecto: p, tickets, tasks_by_status: tasks }
    },
    null
  )
}

export async function searchInvoices(q: string, limit = 10) {
  const term = `%${q.trim()}%`
  if (q.trim().length < 2) return []
  return safe(
    'searchInvoices',
    () =>
      prisma.$queryRaw<
        {
          id: number
          invoice_number: string
          client_name: string
          total: number
          status: string
          issue_date: string
          linked_bank: boolean
        }[]
      >`
        SELECT id, invoice_number, client_name, total::float8 AS total, status,
               issue_date::text, (bank_transaction_id IS NOT NULL) AS linked_bank
        FROM invoices
        WHERE deleted_at IS NULL
          AND (client_name ILIKE ${term} OR invoice_number ILIKE ${term})
        ORDER BY issue_date DESC
        LIMIT ${limit}
      `,
    []
  )
}

export async function getPipelineBrief() {
  return safe(
    'pipelineBrief',
    async () => {
      const rows = await query<{ stage: string; n: string; amount: string }>(
        `SELECT stage, COUNT(*)::text AS n, COALESCE(SUM(amount),0)::text AS amount
         FROM pipeline_cards WHERE deleted_at IS NULL
         GROUP BY stage ORDER BY SUM(amount) DESC NULLS LAST`
      )
      return rows.rows.map((r) => ({
        stage: r.stage,
        n: Number(r.n),
        amount_eur: Number(r.amount),
      }))
    },
    []
  )
}
