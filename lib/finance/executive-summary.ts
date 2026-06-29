import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { getBankConnectionStatus } from '@/lib/enable-banking/connection-status'
import { buildFinanceAlerts } from './alerts'
import { categorizeExpenses, categorizeIncome } from './categorize-transactions'
import { ANNUAL_TARGET } from './chart-theme'
import {
  countUnclassifiedExpenses,
  loadExpenseTransactionsYtd,
  loadMrrByClient,
} from './expense-sources'
import { buildAnnualGoalDetail, buildRichKpiCards } from './kpi-details'
import type {
  ExecutiveSummary,
  MonthlyCashFlow,
  MonthlyInvoicedCollected,
  PendingInvoiceRow,
  ProjectEconomicsRow,
} from './types'

const USD_TO_EUR = 0.93

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${String(year).slice(2)}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

export async function buildExecutiveSummary(): Promise<ExecutiveSummary> {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const startThisMonth = startOfMonth(now)
  const endThisMonth = endOfMonth(now)
  const sixMonthsAgo = new Date(y, m - 5, 1)

  const startLastMonth = startOfMonth(new Date(y, m - 1, 1))
  const endLastMonth = endOfMonth(new Date(y, m - 1, 1))

  const [
    mrrRows,
    balanceResult,
    cashFlowRaw,
    burnRaw,
    profitMonthRaw,
    invoicedMonth,
    collectedMonth,
    invoicedLastMonth,
    collectedLastMonth,
    invoicesCountMonth,
    balanceLastMonthResult,
    pipelineCards,
    pendingInvoicesRaw,
    projectEconRaw,
    bankConnection,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ mrr: string | number; count: bigint }>>`
      SELECT COALESCE(SUM(monthly_fee_eur), 0) AS mrr, COUNT(*)::bigint AS count
      FROM proyectos
      WHERE monthly_fee_eur IS NOT NULL AND monthly_fee_eur > 0
        AND status NOT IN ('churned', 'paused')
    `,
    query<{ balance: number }>(
      `SELECT balance FROM bank_transactions
       WHERE balance IS NOT NULL
       ORDER BY date DESC, created_at DESC LIMIT 1`
    ).catch(() => ({ rows: [] as { balance: number }[] })),
    query<{ year: number; month: number; income: string; expenses: string }>(
      `SELECT
         EXTRACT(YEAR FROM date)::int AS year,
         EXTRACT(MONTH FROM date)::int AS month,
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
       FROM bank_transactions
       WHERE date >= $1
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [sixMonthsAgo.toISOString().slice(0, 10)]
    ).catch(() => ({ rows: [] })),
    query<{ avg_burn: string }>(
      `SELECT COALESCE(AVG(monthly_burn), 0) AS avg_burn FROM (
         SELECT
           EXTRACT(YEAR FROM date) AS y,
           EXTRACT(MONTH FROM date) AS mo,
           SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS monthly_burn
         FROM bank_transactions
         WHERE date >= $1
         GROUP BY 1, 2
       ) sub`,
      [new Date(y, m - 2, 1).toISOString().slice(0, 10)]
    ).catch(() => ({ rows: [{ avg_burn: '0' }] })),
    query<{ net: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS net
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2`,
      [startThisMonth.toISOString().slice(0, 10), endThisMonth.toISOString().slice(0, 10)]
    ).catch(() => ({ rows: [{ net: '0' }] })),
    prisma.invoice.aggregate({
      where: {
        deleted_at: null,
        status: 'sent',
        issue_date: { gte: startThisMonth, lte: endThisMonth },
      },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: {
        deleted_at: null,
        status: 'sent',
        bank_transaction_id: { not: null },
        issue_date: { gte: startThisMonth, lte: endThisMonth },
      },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: {
        deleted_at: null,
        status: 'sent',
        issue_date: { gte: startLastMonth, lte: endLastMonth },
      },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: {
        deleted_at: null,
        status: 'sent',
        bank_transaction_id: { not: null },
        issue_date: { gte: startLastMonth, lte: endLastMonth },
      },
      _sum: { total: true },
    }),
    prisma.invoice.count({
      where: {
        deleted_at: null,
        status: 'sent',
        issue_date: { gte: startThisMonth, lte: endThisMonth },
      },
    }),
    query<{ balance: number }>(
      `SELECT balance FROM bank_transactions
       WHERE balance IS NOT NULL AND date < $1
       ORDER BY date DESC, created_at DESC LIMIT 1`,
      [startThisMonth.toISOString().slice(0, 10)]
    ).catch(() => ({ rows: [] as { balance: number }[] })),
    prisma.pipelineCard.findMany({
      where: {
        deleted_at: null,
        stage: { in: ['NEGOCIANDO', 'PROPUESTA ENVIADA', 'REUNIÓN', 'CONTRATO FIRMADO'] },
      },
      select: { amount: true },
    }),
    prisma.invoice.findMany({
      where: {
        deleted_at: null,
        status: 'sent',
        bank_transaction_id: null,
      },
      orderBy: { issue_date: 'asc' },
      take: 15,
      select: {
        id: true,
        invoice_number: true,
        client_name: true,
        total: true,
        issue_date: true,
        due_date: true,
      },
    }),
    prisma.$queryRaw<
      Array<{
        id: string
        name: string
        monthly_fee_eur: string | number | null
        llm_cost_usd: string | number | null
        infra_cost_usd: string | number | null
        days_inactive_streak: number | null
        nps_score_avg: string | number | null
      }>
    >`
      SELECT p.id, p.name, p.monthly_fee_eur,
        ed.llm_cost_usd, ed.infra_cost_usd, ed.days_inactive_streak, ed.nps_score_avg
      FROM proyectos p
      LEFT JOIN LATERAL (
        SELECT llm_cost_usd, infra_cost_usd, days_inactive_streak, nps_score_avg
        FROM engranaje5_data
        WHERE project_id = p.id
        ORDER BY year DESC, month DESC
        LIMIT 1
      ) ed ON true
      WHERE p.status = 'active' AND p.has_mensualidad = true
      ORDER BY p.monthly_fee_eur DESC NULLS LAST
      LIMIT 12
    `,
    getBankConnectionStatus().catch(() => ({
      connected: false,
      account_uid: null,
      valid_until: null,
      days_remaining: null,
      expires_soon: false,
    })),
  ])

  const mrr = Number(mrrRows[0]?.mrr ?? 0)
  const activeClients = Number(mrrRows[0]?.count ?? 0)
  const cashBalance = balanceResult.rows[0]?.balance ? Number(balanceResult.rows[0].balance) : 0
  const avgMonthlyBurn = Number(burnRaw.rows[0]?.avg_burn ?? 0)
  const runwayMonths =
    avgMonthlyBurn > 0 && cashBalance > 0 ? Math.round((cashBalance / avgMonthlyBurn) * 10) / 10 : null

  const invoicedThisMonth = Number(invoicedMonth._sum.total ?? 0)
  const collectedThisMonth = Number(collectedMonth._sum.total ?? 0)
  const invoicedLastMonthVal = Number(invoicedLastMonth._sum.total ?? 0)
  const collectedLastMonthVal = Number(collectedLastMonth._sum.total ?? 0)
  const collectionGap = invoicedThisMonth - collectedThisMonth
  const collectionRatePct =
    invoicedThisMonth > 0
      ? Math.round((collectedThisMonth / invoicedThisMonth) * 1000) / 10
      : null
  const pipelineValue = pipelineCards.reduce((s, c) => s + Number(c.amount ?? 0), 0)
  const pipelineDeals = pipelineCards.length
  const profitThisMonth = Number(profitMonthRaw.rows[0]?.net ?? 0)
  const balanceLastMonth = balanceLastMonthResult.rows[0]?.balance
    ? Number(balanceLastMonthResult.rows[0].balance)
    : null
  const cashChangeMom =
    balanceLastMonth != null ? cashBalance - balanceLastMonth : null

  const cashFlow: MonthlyCashFlow[] = cashFlowRaw.rows.map((r) => {
    const income = Number(r.income)
    const expenses = Number(r.expenses)
    return {
      month: monthLabel(r.year, r.month),
      income,
      expenses,
      net: income - expenses,
    }
  })

  const invoicesForChart = await prisma.invoice.findMany({
    where: {
      deleted_at: null,
      status: 'sent',
      issue_date: { gte: sixMonthsAgo },
    },
    select: { issue_date: true, total: true, bank_transaction_id: true },
  })

  const invoicedMap = new Map<string, { invoiced: number; collected: number }>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - i, 1)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    invoicedMap.set(key, { invoiced: 0, collected: 0 })
  }

  for (const inv of invoicesForChart) {
    const d = new Date(inv.issue_date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const bucket = invoicedMap.get(key)
    if (!bucket) continue
    const total = Number(inv.total)
    bucket.invoiced += total
    if (inv.bank_transaction_id) bucket.collected += total
  }

  const invoicedVsCollected: MonthlyInvoicedCollected[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - i, 1)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const bucket = invoicedMap.get(key) ?? { invoiced: 0, collected: 0 }
    invoicedVsCollected.push({
      month: monthLabel(d.getFullYear(), d.getMonth() + 1),
      invoiced: bucket.invoiced,
      collected: bucket.collected,
    })
  }

  const draftCount = await prisma.invoice.count({
    where: { deleted_at: null, status: 'draft' },
  })

  const pendingInvoices: PendingInvoiceRow[] = pendingInvoicesRaw.map((inv) => {
    const due = inv.due_date ? new Date(inv.due_date) : null
    const daysOverdue =
      due && due < now
        ? Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
        : null
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      client_name: inv.client_name,
      total: Number(inv.total),
      issue_date: inv.issue_date.toISOString().slice(0, 10),
      due_date: inv.due_date ? inv.due_date.toISOString().slice(0, 10) : null,
      days_overdue: daysOverdue,
    }
  })

  const pendingCollectionTotal = pendingInvoices.reduce((s, i) => s + i.total, 0)

  const projectEconomics: ProjectEconomicsRow[] = projectEconRaw.map((p) => {
    const fee = Number(p.monthly_fee_eur ?? 0)
    const llm = Number(p.llm_cost_usd ?? 0) * USD_TO_EUR
    const infra = Number(p.infra_cost_usd ?? 0) * USD_TO_EUR
    const totalCost = llm + infra
    const marginPct = fee > 0 ? Math.round(((fee - totalCost) / fee) * 100) : null
    return {
      id: p.id,
      name: p.name,
      monthly_fee_eur: fee,
      llm_cost_eur: Math.round(llm * 100) / 100,
      infra_cost_eur: Math.round(infra * 100) / 100,
      total_cost_eur: Math.round(totalCost * 100) / 100,
      margin_pct: marginPct,
      days_inactive_streak: p.days_inactive_streak,
      nps_score_avg: p.nps_score_avg != null ? Number(p.nps_score_avg) : null,
    }
  })

  const highCostProjects = projectEconomics.filter(
    (p) => p.margin_pct !== null && p.margin_pct < 30 && p.monthly_fee_eur > 0
  )

  const startYTD = new Date(y, 0, 1)

  const [expenseLoad, mrr_by_client, unclassified] = await Promise.all([
    loadExpenseTransactionsYtd(startYTD),
    loadMrrByClient(),
    countUnclassifiedExpenses(startYTD),
  ])

  const expenseTx = expenseLoad.transactions.filter((t) => t.amount < 0)
  const incomeTxFromBank = await query<{ description: string; amount: string; date: string }>(
    `SELECT description, amount, date::text AS date
     FROM bank_transactions
     WHERE date >= $1 AND amount > 0
     ORDER BY date DESC`,
    [startYTD.toISOString().slice(0, 10)]
  ).catch(() => ({ rows: [] as { description: string; amount: string; date: string }[] }))

  const incomeTx = incomeTxFromBank.rows.map((r) => ({
    description: r.description || '',
    amount: Number(r.amount),
    date: r.date,
  }))

  const expense_breakdown = categorizeExpenses(expenseTx)
  const income_breakdown = categorizeIncome(incomeTx)
  const expense_source_label = expenseLoad.source_label
  const net_trend = cashFlow.map((c) => ({ month: c.month, net: c.net }))

  const alertsFinal = buildFinanceAlerts({
    bankConnection,
    collectionGap,
    collectionRatePct,
    pendingInvoices,
    draftCount,
    runwayMonths,
    cashBalance,
    highCostProjects,
    mrr,
    pipelineValue,
    unlinkedManualExpenses: unclassified.unlinked_manual,
    unlinkedManualTotal: unclassified.unlinked_manual_total,
    bankExpensesWithoutManual: unclassified.bank_without_manual,
  })

  const invoicedYTD = await prisma.invoice.aggregate({
    where: { deleted_at: null, status: 'sent', issue_date: { gte: new Date(y, 0, 1) } },
    _sum: { total: true },
  })
  const ytdInvoiced = Number(invoicedYTD._sum.total ?? 0)

  const annual_goal = buildAnnualGoalDetail({
    ytdInvoiced,
    invoiced_this_month: invoicedThisMonth,
    now,
  })

  const kpi_cards = buildRichKpiCards({
    mrr,
    arr: mrr * 12,
    active_clients: activeClients,
    cash_balance: cashBalance,
    cash_change_mom: cashChangeMom,
    runway_months: runwayMonths,
    avg_monthly_burn: avgMonthlyBurn,
    invoiced_this_month: invoicedThisMonth,
    invoiced_last_month: invoicedLastMonthVal,
    collected_this_month: collectedThisMonth,
    collected_last_month: collectedLastMonthVal,
    collection_gap: collectionGap,
    collection_rate_pct: collectionRatePct,
    pending_collection_total: pendingCollectionTotal,
    pending_invoices_count: pendingInvoices.length,
    invoices_this_month_count: invoicesCountMonth,
    pipeline_value: pipelineValue,
    pipeline_deals: pipelineDeals,
    profit_this_month: profitThisMonth,
    ytdInvoiced,
  })

  return {
    kpis: {
      mrr,
      arr: mrr * 12,
      active_clients: activeClients,
      cash_balance: cashBalance,
      runway_months: runwayMonths,
      invoiced_this_month: invoicedThisMonth,
      collected_this_month: collectedThisMonth,
      collection_gap: collectionGap,
      pipeline_value: pipelineValue,
      avg_monthly_burn: avgMonthlyBurn,
      profit_this_month: profitThisMonth,
      annual_target: ANNUAL_TARGET,
      annual_progress_pct: annual_goal.achieved_pct,
    },
    annual_goal,
    kpi_cards,
    cash_flow: cashFlow,
    invoiced_vs_collected: invoicedVsCollected,
    expense_breakdown,
    income_breakdown,
    expense_source_label,
    mrr_by_client,
    net_trend,
    alerts: alertsFinal,
    pending_invoices: pendingInvoices,
    project_economics: projectEconomics,
    generated_at: now.toISOString(),
  }
}
