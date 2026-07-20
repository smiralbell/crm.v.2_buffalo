import { prisma } from '@/lib/prisma'

async function safeQuery<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.warn(`[analisis/snapshot] ${label}:`, e instanceof Error ? e.message : e)
    return fallback
  }
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Snapshot cuantitativo del CRM para el agente de Análisis IA.
 * Alineado con docs/CRM_GUIA_ANALISIS_IA.md
 */
export async function buildCrmCompanySnapshot() {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthStartStr = monthStart.toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const leadsByEstado = await safeQuery(
    'leadsByEstado',
    () =>
      prisma.$queryRaw<{ estado: string; n: number; valor_eur: number }[]>`
        SELECT COALESCE(estado, 'sin_estado') AS estado,
               COUNT(*)::int AS n,
               COALESCE(SUM(valor)::float8, 0) AS valor_eur
        FROM leads
        GROUP BY 1
        ORDER BY n DESC
      `,
    []
  )

  const leadsConfig = await safeQuery(
    'leadsConfig',
    () =>
      prisma.$queryRaw<{ total: number; configurados: number; valor_config: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE configuracion IS NOT NULL AND configuracion <> ''
          )::int AS configurados,
          COALESCE(SUM(valor) FILTER (
            WHERE configuracion IS NOT NULL AND configuracion <> ''
          ), 0)::float8 AS valor_config
        FROM leads
      `,
    [{ total: 0, configurados: 0, valor_config: 0 }]
  )

  const portfolio = await safeQuery(
    'portfolio',
    () =>
      prisma.$queryRaw<
        {
          status: string
          n: number
          setup_eur: number
          mrr_eur: number
        }[]
      >`
        SELECT p.status,
               COUNT(*)::int AS n,
               COALESCE(SUM(p.setup_fee_eur), 0)::float8 AS setup_eur,
               COALESCE(SUM(p.monthly_fee_eur), 0)::float8 AS mrr_eur
        FROM proyectos p
        INNER JOIN leads l ON l.id = p.lead_id
        WHERE p.es_buffalo = TRUE
          AND p.status IN ('development', 'active', 'paused')
          AND l.configuracion IS NOT NULL
          AND l.configuracion <> ''
        GROUP BY 1
      `,
    []
  )

  const portfolioDetail = await safeQuery(
    'portfolioDetail',
    () =>
      prisma.$queryRaw<
        {
          name: string
          status: string
          service_type: string
          setup_fee_eur: number | null
          monthly_fee_eur: number | null
          tiempo_previsto: string | null
          fecha_inicio_real: string | null
          fecha_fin_real: string | null
          has_mensualidad: boolean
        }[]
      >`
        SELECT p.name, p.status, p.service_type,
               p.setup_fee_eur::float8 AS setup_fee_eur,
               p.monthly_fee_eur::float8 AS monthly_fee_eur,
               p.tiempo_previsto,
               p.fecha_inicio_real::text AS fecha_inicio_real,
               p.fecha_fin_real::text AS fecha_fin_real,
               p.has_mensualidad
        FROM proyectos p
        INNER JOIN leads l ON l.id = p.lead_id
        WHERE p.es_buffalo = TRUE
          AND p.status IN ('development', 'active', 'paused')
          AND l.configuracion IS NOT NULL
          AND l.configuracion <> ''
        ORDER BY p.updated_at DESC
        LIMIT 40
      `,
    []
  )

  const retention = await safeQuery(
    'retention',
    () =>
      prisma.$queryRaw<{ n: number; mrr_eur: number }[]>`
        SELECT COUNT(*)::int AS n,
               COALESCE(SUM(monthly_fee_eur), 0)::float8 AS mrr_eur
        FROM proyectos
        WHERE has_mensualidad = TRUE
          AND status IN ('development', 'active', 'paused')
      `,
    [{ n: 0, mrr_eur: 0 }]
  )

  const churned90 = await safeQuery(
    'churned90',
    () =>
      prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n
        FROM proyectos
        WHERE status = 'churned'
          AND updated_at >= ${thirtyDaysAgo}
      `,
    [{ n: 0 }]
  )

  const invoicesMonth = await safeQuery(
    'invoicesMonth',
    () =>
      prisma.$queryRaw<
        { n: number; total_eur: number; draft_eur: number; sent_eur: number }[]
      >`
        SELECT
          COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS n,
          COALESCE(SUM(total) FILTER (WHERE deleted_at IS NULL AND status = 'sent'), 0)::float8 AS sent_eur,
          COALESCE(SUM(total) FILTER (WHERE deleted_at IS NULL AND status = 'draft'), 0)::float8 AS draft_eur,
          COALESCE(SUM(total) FILTER (WHERE deleted_at IS NULL), 0)::float8 AS total_eur
        FROM invoices
        WHERE issue_date >= ${monthStartStr}::date
          AND COALESCE(invoice_source, 'client') = 'client'
      `,
    [{ n: 0, total_eur: 0, draft_eur: 0, sent_eur: 0 }]
  )

  const invoicesPending = await safeQuery(
    'invoicesPending',
    () =>
      prisma.$queryRaw<{ n: number; total_eur: number }[]>`
        SELECT COUNT(*)::int AS n,
               COALESCE(SUM(total), 0)::float8 AS total_eur
        FROM invoices
        WHERE deleted_at IS NULL
          AND status IN ('draft', 'sent')
          AND COALESCE(invoice_source, 'client') = 'client'
          AND (bank_transaction_id IS NULL)
      `,
    [{ n: 0, total_eur: 0 }]
  )

  const bankMonth = await safeQuery(
    'bankMonth',
    () =>
      prisma.$queryRaw<{ ingresos: number; gastos: number }[]>`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::float8 AS ingresos,
          COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0)::float8 AS gastos
        FROM bank_transactions
        WHERE date >= ${monthStartStr}::date
      `,
    [{ ingresos: 0, gastos: 0 }]
  )

  const tickets = await safeQuery(
    'tickets',
    () =>
      prisma.$queryRaw<{ status: string; n: number }[]>`
        SELECT status, COUNT(*)::int AS n
        FROM tickets
        GROUP BY 1
      `,
    []
  )

  const tasks = await safeQuery(
    'tasks',
    () =>
      prisma.$queryRaw<{ status: string; n: number; hours: number }[]>`
        SELECT status,
               COUNT(*)::int AS n,
               COALESCE(SUM(estimated_hours), 0)::float8 AS hours
        FROM project_dev_tasks
        GROUP BY 1
      `,
    []
  )

  const coldcall = await safeQuery(
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
          (SELECT COUNT(*)::int FROM coldcall_calls WHERE fecha >= ${thirtyDaysAgo}) AS calls_30d,
          (SELECT COUNT(*)::int FROM coldcall_calls
            WHERE fecha >= ${thirtyDaysAgo} AND resultado = 'reunion_agendada') AS meetings_30d,
          (SELECT COUNT(*)::int FROM coldcall_calls
            WHERE fecha >= ${thirtyDaysAgo} AND resultado = 'interesado') AS interested_30d,
          (SELECT COUNT(*)::int FROM coldcall_prospects
            WHERE deleted_at IS NULL
              AND COALESCE(do_not_call, false) = false
              AND stage NOT IN ('no_interesado', 'descartado_numero_erroneo', 'reunion_agendada')
          ) AS prospects_open
      `,
    [{ calls_30d: 0, meetings_30d: 0, interested_30d: 0, prospects_open: 0 }]
  )

  const marketing = await safeQuery(
    'marketing',
    () =>
      prisma.$queryRaw<
        {
          channel: string
          period: string
          spend: number
          meetings_booked: number
          replies: number
          emails_sent: number
        }[]
      >`
        SELECT channel, period,
               COALESCE(spend, 0)::float8 AS spend,
               COALESCE(meetings_booked, 0)::int AS meetings_booked,
               COALESCE(replies, 0)::int AS replies,
               COALESCE(emails_sent, 0)::int AS emails_sent
        FROM marketing_metrics
        ORDER BY period DESC
        LIMIT 24
      `,
    []
  )

  const pipelineCards = await safeQuery(
    'pipelineCards',
    () =>
      prisma.$queryRaw<{ stage: string; n: number; amount_eur: number }[]>`
        SELECT stage,
               COUNT(*)::int AS n,
               COALESCE(SUM(amount), 0)::float8 AS amount_eur
        FROM pipeline_cards
        WHERE deleted_at IS NULL
        GROUP BY 1
        ORDER BY amount_eur DESC
        LIMIT 20
      `,
    []
  )

  const setupOpen = portfolio.reduce((s, r) => s + num(r.setup_eur), 0)
  const mrrOpen = portfolio.reduce((s, r) => s + num(r.mrr_eur), 0)
  const nOpen = portfolio.reduce((s, r) => s + num(r.n), 0)

  return {
    generated_at: now.toISOString(),
    ontology_ref: 'docs/CRM_GUIA_ANALISIS_IA.md',
    rules: {
      buffalo_open:
        'es_buffalo=true AND status in (development,active,paused) AND lead con configuracion',
      production: "status='active' → en producción (tarjeta verde)",
      money_setup: 'proyectos.setup_fee_eur (one-shot, suele sin IVA)',
      money_mrr: 'proyectos.monthly_fee_eur (/mes)',
      invoice_vs_cash: 'invoices.total facturado ≠ bank_transactions cobrado',
    },
    comercial: {
      leads_by_estado: leadsByEstado,
      leads_total: num(leadsConfig[0]?.total),
      leads_configurados: num(leadsConfig[0]?.configurados),
      leads_valor_configurados_eur: num(leadsConfig[0]?.valor_config),
      pipeline_cards_by_stage: pipelineCards,
    },
    proyectos: {
      open_by_status: portfolio,
      open_count: nOpen,
      open_setup_eur: Math.round(setupOpen * 100) / 100,
      open_mrr_eur: Math.round(mrrOpen * 100) / 100,
      detail: portfolioDetail,
      retention_clients: num(retention[0]?.n),
      retention_mrr_eur: Math.round(num(retention[0]?.mrr_eur) * 100) / 100,
      churned_last_30d: num(churned90[0]?.n),
    },
    operaciones: {
      tickets_by_status: tickets,
      tasks_by_status: tasks,
    },
    finanzas: {
      month_start: monthStartStr,
      invoices_client_this_month: {
        count: num(invoicesMonth[0]?.n),
        sent_eur: num(invoicesMonth[0]?.sent_eur),
        draft_eur: num(invoicesMonth[0]?.draft_eur),
      },
      invoices_unmatched_bank: {
        count: num(invoicesPending[0]?.n),
        total_eur: num(invoicesPending[0]?.total_eur),
      },
      bank_this_month: {
        ingresos_eur: num(bankMonth[0]?.ingresos),
        gastos_eur: num(bankMonth[0]?.gastos),
        neto_eur: num(bankMonth[0]?.ingresos) + num(bankMonth[0]?.gastos),
      },
    },
    marketing: {
      coldcall_30d: coldcall[0] || {
        calls_30d: 0,
        meetings_30d: 0,
        interested_30d: 0,
        prospects_open: 0,
      },
      metrics_recent: marketing,
    },
    objetivo_anual_facturacion_eur: 250_000,
  }
}

export type CrmCompanySnapshot = Awaited<ReturnType<typeof buildCrmCompanySnapshot>>
