import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { loadExpenseTransactionsForPeriod } from '@/lib/finance/expense-sources'
import { detectRecurringExpenses, recurringOpsMonthly } from '@/lib/finance/recurring-expenses'
import { periodBounds, listRecentPeriods } from '@/lib/leads/analytics'
import type {
  FinanceDashboardAnalytics,
  FinanceMonthPoint,
  ProjectMoneyBucket,
  PipelineOpenDeal,
} from '@/lib/finance/dashboard-analytics.types'

export type { FinanceDashboardAnalytics } from '@/lib/finance/dashboard-analytics.types'
export { currentFinancePeriod } from '@/lib/finance/dashboard-analytics.types'
export { listRecentPeriods }

function money(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
}

function emptyBucket(): ProjectMoneyBucket {
  return { count: 0, setup_eur: 0, monthly_eur: 0 }
}

async function bankBalance(): Promise<number> {
  try {
    const { rows } = await query<{ balance: string }>(
      `SELECT balance::text AS balance
       FROM bank_transactions
       WHERE balance IS NOT NULL
       ORDER BY date DESC, created_at DESC
       LIMIT 1`
    )
    return money(rows[0]?.balance)
  } catch {
    return 0
  }
}

async function sumInvoiced(start: Date, end: Date): Promise<number> {
  try {
    // Misma regla que Finanzas (executive-summary): facturas enviadas por fecha de emisión
    const agg = await prisma.invoice.aggregate({
      where: {
        deleted_at: null,
        status: 'sent',
        issue_date: { gte: start, lte: end },
      },
      _sum: { total: true },
    })
    return money(agg._sum.total)
  } catch {
    return 0
  }
}

async function sumBankOutflows(start: Date, end: Date): Promise<number> {
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)
  try {
    const { rows } = await query<{ total: string }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0)::text AS total
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2 AND amount < 0`,
      [startStr, endStr]
    )
    return money(rows[0]?.total)
  } catch {
    return 0
  }
}

async function sumMensualidadCobrada(start: Date, end: Date): Promise<number> {
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)
  try {
    const { rows } = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2
         AND amount > 0
         AND COALESCE(is_recurring_income, FALSE) = TRUE`,
      [startStr, endStr]
    )
    return money(rows[0]?.total)
  } catch {
    return 0
  }
}

async function sumCollected(start: Date, end: Date): Promise<number> {
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)
  try {
    const { rows } = await query<{ total: string }>(
      `SELECT COALESCE(SUM(bt.amount), 0)::text AS total
       FROM invoices i
       INNER JOIN bank_transactions bt ON bt.id = i.bank_transaction_id
       WHERE i.deleted_at IS NULL
         AND COALESCE(i.status, '') <> 'cancelled'
         AND bt.date >= $1 AND bt.date <= $2
         AND bt.amount > 0`,
      [startStr, endStr]
    )
    return money(rows[0]?.total)
  } catch {
    return 0
  }
}

async function currentClientsPortfolio(): Promise<{
  count: number
  setup_eur: number
  monthly_eur: number
  avg_setup: number
  avg_monthly: number
}> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      { n: number; setup: number; mrr: number }[]
    >(
      `
      SELECT
        COUNT(*)::int AS n,
        COALESCE(SUM(setup_fee_eur), 0)::float8 AS setup,
        COALESCE(SUM(monthly_fee_eur), 0)::float8 AS mrr
      FROM proyectos
      WHERE es_buffalo = TRUE
        AND status IN ('development', 'active', 'paused')
      `
    )
    const n = Number(rows[0]?.n) || 0
    const setup = money(rows[0]?.setup)
    const mrr = money(rows[0]?.mrr)
    return {
      count: n,
      setup_eur: setup,
      monthly_eur: mrr,
      avg_setup: n > 0 ? money(setup / n) : 4500,
      avg_monthly: n > 0 ? money(mrr / n) : 350,
    }
  } catch {
    return { count: 0, setup_eur: 0, monthly_eur: 0, avg_setup: 4500, avg_monthly: 350 }
  }
}

async function projectBucket(
  opts: {
    /** Onboarding = nacimiento del proyecto; Gestión = paso a es_buffalo */
    mode: 'onboarding_created' | 'gestion_started' | 'finished'
    start: Date
    end: Date
  }
): Promise<ProjectMoneyBucket> {
  const { mode, start, end } = opts
  try {
    let whereSql = ''
    if (mode === 'onboarding_created') {
      // Proyectos que aparecen en Onboarding (creación de la fila)
      whereSql = `
        created_at IS NOT NULL
        AND created_at >= $1::timestamptz
        AND created_at <= $2::timestamptz
      `
    } else if (mode === 'gestion_started') {
      // Pasaron al apartado Proyectos / Gestión («Poner en marcha»)
      whereSql = `
        es_buffalo = TRUE
        AND COALESCE(launched_at, fecha_inicio_real) IS NOT NULL
        AND COALESCE(launched_at, fecha_inicio_real)::timestamptz >= $1::timestamptz
        AND COALESCE(launched_at, fecha_inicio_real)::timestamptz <= $2::timestamptz
      `
    } else {
      whereSql = `
        es_buffalo = TRUE
        AND fecha_fin_real IS NOT NULL
        AND fecha_fin_real::timestamptz >= $1::timestamptz
        AND fecha_fin_real::timestamptz <= $2::timestamptz
      `
    }

    const rows = await prisma.$queryRawUnsafe<
      { n: number; setup: number; mrr: number }[]
    >(
      `
      SELECT
        COUNT(*)::int AS n,
        COALESCE(SUM(setup_fee_eur), 0)::float8 AS setup,
        COALESCE(SUM(monthly_fee_eur), 0)::float8 AS mrr
      FROM proyectos
      WHERE ${whereSql}
      `,
      start,
      end
    )
    return {
      count: Number(rows[0]?.n) || 0,
      setup_eur: money(rows[0]?.setup),
      monthly_eur: money(rows[0]?.mrr),
    }
  } catch {
    return emptyBucket()
  }
}

async function recurringMonthly(start: Date, end: Date): Promise<number> {
  try {
    // SaaS + marketing + servicios profesionales (equiv. mensual)
    const { transactions } = await loadExpenseTransactionsForPeriod(start, end, 'bank_only')
    const rows = detectRecurringExpenses(
      transactions.map((t) => ({
        description: t.description,
        amount: t.amount,
        date: t.date,
        expense_bucket: t.expense_bucket ?? null,
      }))
    )
    return money(recurringOpsMonthly(rows))
  } catch {
    return 0
  }
}

async function buildTimeline(count = 12): Promise<FinanceMonthPoint[]> {
  const now = new Date()
  const oldest = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1)
  const startStr = oldest.toISOString().slice(0, 10)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const endStr = endOfMonth.toISOString().slice(0, 10)

  const emptyMonths = new Map<string, FinanceMonthPoint>()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
    emptyMonths.set(value, {
      period: value,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      invoiced_eur: 0,
      collected_eur: 0,
      expenses_eur: 0,
      mensualidad_eur: 0,
    })
  }

  try {
    const [inv, col, exp, men] = await Promise.all([
      prisma.$queryRaw<{ ym: string; total: number }[]>`
        SELECT to_char(issue_date, 'YYYY-MM') AS ym,
               COALESCE(SUM(total), 0)::float8 AS total
        FROM invoices
        WHERE deleted_at IS NULL
          AND status = 'sent'
          AND issue_date >= ${oldest}
          AND issue_date <= ${endOfMonth}
        GROUP BY 1
      `,
      query<{ ym: string; total: string }>(
        `SELECT to_char(bt.date, 'YYYY-MM') AS ym,
                COALESCE(SUM(i.total), 0)::text AS total
         FROM invoices i
         INNER JOIN bank_transactions bt ON bt.id = i.bank_transaction_id
         WHERE i.deleted_at IS NULL
           AND i.status = 'sent'
           AND i.bank_transaction_id IS NOT NULL
           AND bt.date >= $1 AND bt.date <= $2
           AND bt.amount > 0
         GROUP BY 1`,
        [startStr, endStr]
      ),
      query<{ ym: string; total: string }>(
        `SELECT to_char(date, 'YYYY-MM') AS ym,
                COALESCE(SUM(ABS(amount)), 0)::text AS total
         FROM bank_transactions
         WHERE date >= $1 AND date <= $2 AND amount < 0
         GROUP BY 1`,
        [startStr, endStr]
      ),
      query<{ ym: string; total: string }>(
        `SELECT to_char(date, 'YYYY-MM') AS ym,
                COALESCE(SUM(amount), 0)::text AS total
         FROM bank_transactions
         WHERE date >= $1 AND date <= $2
           AND amount > 0
           AND COALESCE(is_recurring_income, FALSE) = TRUE
         GROUP BY 1`,
        [startStr, endStr]
      ),
    ])

    for (const r of inv) {
      const row = emptyMonths.get(r.ym)
      if (row) row.invoiced_eur = money(r.total)
    }
    for (const r of col.rows) {
      const row = emptyMonths.get(r.ym)
      if (row) row.collected_eur = money(r.total)
    }
    for (const r of exp.rows) {
      const row = emptyMonths.get(r.ym)
      if (row) row.expenses_eur = money(r.total)
    }
    for (const r of men.rows) {
      const row = emptyMonths.get(r.ym)
      if (row) row.mensualidad_eur = money(r.total)
    }
  } catch (err) {
    console.warn('[finance/dashboard-analytics] timeline failed', err)
  }

  return Array.from(emptyMonths.values())
}

/** Etapas comerciales abiertas / pendientes de cobro */
const OPEN_PIPELINE_STAGES = [
  'REUNIÓN',
  'PROPUESTA ENVIADA',
  'PROPUESTA CREADA',
  'NEGOCIANDO',
  'CONTRATO FIRMADO',
  'FACTURA EMITIDA',
  'ACEPTADO',
]

async function loadOpenPipelineDeals(avgMonthly: number): Promise<PipelineOpenDeal[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      {
        card_id: string
        stage: string
        amount: number | null
        entity_id: string
        contact_id: number | null
        name: string | null
        empresa: string | null
        lead_valor: number | null
        setup_fee: number | null
        monthly_fee: number | null
      }[]
    >(
      `
      SELECT DISTINCT ON (COALESCE(c.id::text, pc.entity_id))
        pc.id::text AS card_id,
        pc.stage,
        pc.amount::float8 AS amount,
        pc.entity_id,
        c.id AS contact_id,
        COALESCE(NULLIF(TRIM(c.nombre), ''), 'Sin nombre') AS name,
        NULLIF(TRIM(c.empresa), '') AS empresa,
        l.valor::float8 AS lead_valor,
        p.setup_fee_eur::float8 AS setup_fee,
        p.monthly_fee_eur::float8 AS monthly_fee
      FROM pipeline_cards pc
      LEFT JOIN contacts c
        ON c.id::text = pc.entity_id
       AND (pc.entity_type = 'contact' OR pc.entity_type IS NULL OR pc.entity_type = '')
      LEFT JOIN leads l ON l.contact_id = c.id
      LEFT JOIN proyectos p ON p.lead_id = l.id
      WHERE pc.deleted_at IS NULL
        AND pc.stage = ANY($1::text[])
      ORDER BY
        COALESCE(c.id::text, pc.entity_id),
        CASE pc.stage
          WHEN 'FACTURA EMITIDA' THEN 1
          WHEN 'CONTRATO FIRMADO' THEN 2
          WHEN 'ACEPTADO' THEN 3
          WHEN 'NEGOCIANDO' THEN 4
          WHEN 'PROPUESTA ENVIADA' THEN 5
          WHEN 'PROPUESTA CREADA' THEN 6
          WHEN 'REUNIÓN' THEN 7
          ELSE 8
        END,
        COALESCE(pc.amount, p.setup_fee_eur, l.valor, 0) DESC
      `,
      OPEN_PIPELINE_STAGES
    )

    return rows.map((r) => {
      const setup = money(r.setup_fee ?? r.amount ?? r.lead_valor ?? 0)
      const monthly = money(r.monthly_fee ?? avgMonthly)
      return {
        card_id: r.card_id,
        contact_id: r.contact_id,
        name: r.name || 'Sin nombre',
        empresa: r.empresa,
        stage: r.stage,
        setup_eur: setup,
        monthly_eur: monthly,
        has_price: setup > 0,
      }
    })
  } catch (err) {
    console.warn('[finance/dashboard-analytics] pipeline_open failed', err)
    return []
  }
}

/**
 * Analítica financiera para el dashboard (mes YYYY-MM).
 */
export async function getFinanceDashboardAnalytics(
  period: string
): Promise<FinanceDashboardAnalytics> {
  const { start, end, label } = periodBounds(period)

  const [
    bank_balance_eur,
    invoiced_eur,
    expenses_eur,
    portfolio,
    projects_created,
    projects_started,
    projects_finished,
    mensualidad_cobrada_eur,
    recurring_expenses_eur,
    timeline,
  ] = await Promise.all([
    bankBalance(),
    sumInvoiced(start, end),
    sumBankOutflows(start, end),
    currentClientsPortfolio(),
    projectBucket({ mode: 'onboarding_created', start, end }),
    projectBucket({ mode: 'gestion_started', start, end }),
    projectBucket({ mode: 'finished', start, end }),
    sumMensualidadCobrada(start, end),
    recurringMonthly(start, end),
    buildTimeline(12),
  ])

  const pipeline_open = await loadOpenPipelineDeals(portfolio.avg_monthly)

  return {
    period,
    period_label: label.charAt(0).toUpperCase() + label.slice(1),
    kpis: {
      bank_balance_eur,
      invoiced_eur,
      expenses_eur,
      clients_current: portfolio.count,
      clients_current_setup_eur: portfolio.setup_eur,
      clients_current_monthly_eur: portfolio.monthly_eur,
      projects_created,
      projects_started,
      projects_finished,
      mensualidad_cobrada_eur,
      recurring_expenses_eur,
    },
    timeline,
    averages: {
      avg_setup_eur: portfolio.avg_setup,
      avg_monthly_eur: portfolio.avg_monthly,
    },
    pipeline_open,
  }
}
