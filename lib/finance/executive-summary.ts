import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { getBankConnectionStatus } from '@/lib/enable-banking/connection-status'
import { buildFinanceAlerts } from './alerts'
import { categorizeExpenses, categorizeIncome } from './categorize-transactions'
import { ANNUAL_TARGET } from './chart-theme'
import {
  countUnclassifiedExpenses,
  loadExpenseTransactionsForPeriod,
} from './expense-sources'
import { computeBankMrr } from './mrr-from-bank'
import { buildAnnualGoalDetail, buildRichKpiCards } from './kpi-details'
import { formatPeriodLabel, getDefaultPeriodRange, clampPeriodStart, periodDays, type PeriodRange } from './period-presets'
import type {
  ExecutiveSummary,
  MonthlyCashFlow,
  MonthlyInvoicedCollected,
  PendingInvoiceRow,
} from './types'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${String(year).slice(2)}`
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export async function buildExecutiveSummary(periodInput?: PeriodRange): Promise<ExecutiveSummary> {
  const now = new Date()
  const period = periodInput ?? getDefaultPeriodRange(now)
  const periodStart = clampPeriodStart(new Date(period.start))
  const periodEnd = endOfDay(period.end)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const periodEndStr = periodEnd.toISOString().slice(0, 10)
  const period_label = formatPeriodLabel(periodStart, periodEnd)
  const chartDaily = periodDays(periodStart, periodEnd) <= 31

  const y = now.getFullYear()
  const m = now.getMonth()
  const startThisMonth = startOfMonth(now)
  const endThisMonth = endOfMonth(now)

  const startLastMonth = startOfMonth(new Date(y, m - 1, 1))
  const endLastMonth = endOfMonth(new Date(y, m - 1, 1))

  const [
    bankMrr,
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
    bankConnection,
  ] = await Promise.all([
    computeBankMrr(),
    query<{ balance: number }>(
      `SELECT balance FROM bank_transactions
       WHERE balance IS NOT NULL
       ORDER BY date DESC, created_at DESC LIMIT 1`
    ).catch(() => ({ rows: [] as { balance: number }[] })),
    query<{ year?: number; month?: number; day?: string; income: string; expenses: string }>(
      chartDaily
        ? `SELECT
             date::text AS day,
             COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
             COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
           FROM bank_transactions
           WHERE date >= $1 AND date <= $2
           GROUP BY date
           ORDER BY date`
        : `SELECT
             EXTRACT(YEAR FROM date)::int AS year,
             EXTRACT(MONTH FROM date)::int AS month,
             COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
             COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
           FROM bank_transactions
           WHERE date >= $1 AND date <= $2
           GROUP BY 1, 2
           ORDER BY 1, 2`,
      [periodStartStr, periodEndStr]
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
    getBankConnectionStatus().catch(() => ({
      connected: false,
      account_uid: null,
      valid_until: null,
      days_remaining: null,
      expires_soon: false,
    })),
  ])

  const mrr = bankMrr.mrr
  const activeClients = bankMrr.active_clients
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
    const month = chartDaily
      ? dayLabel(r.day!)
      : monthLabel(r.year!, r.month!)
    return {
      month,
      income,
      expenses,
      net: income - expenses,
    }
  })

  const invoicesForChart = await prisma.invoice.findMany({
    where: {
      deleted_at: null,
      status: 'sent',
      issue_date: { gte: periodStart, lte: periodEnd },
    },
    select: { issue_date: true, total: true, bank_transaction_id: true },
  })

  const invoicedMap = new Map<string, { invoiced: number; collected: number; label: string }>()

  if (chartDaily) {
    for (const row of cashFlowRaw.rows) {
      if (!row.day) continue
      invoicedMap.set(row.day, { invoiced: 0, collected: 0, label: dayLabel(row.day) })
    }
  } else {
    const cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
    const endMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1)
    while (cursor <= endMonth) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}`
      invoicedMap.set(key, {
        invoiced: 0,
        collected: 0,
        label: monthLabel(cursor.getFullYear(), cursor.getMonth() + 1),
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  for (const inv of invoicesForChart) {
    const d = new Date(inv.issue_date)
    const key = chartDaily
      ? d.toISOString().slice(0, 10)
      : `${d.getFullYear()}-${d.getMonth()}`
    const bucket = invoicedMap.get(key)
    if (!bucket) continue
    const total = Number(inv.total)
    bucket.invoiced += total
    if (inv.bank_transaction_id) bucket.collected += total
  }

  const invoicedVsCollected: MonthlyInvoicedCollected[] = Array.from(invoicedMap.values()).map(
    (bucket) => ({
      month: bucket.label,
      invoiced: bucket.invoiced,
      collected: bucket.collected,
    })
  )

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

  const [expenseLoad, unclassified] = await Promise.all([
    loadExpenseTransactionsForPeriod(periodStart, periodEnd),
    countUnclassifiedExpenses(periodStart, periodEnd),
  ])

  const expenseTx = expenseLoad.transactions.filter((t) => t.amount < 0)
  const incomeTxFromBank = await query<{ description: string; amount: string; date: string }>(
    `SELECT description, amount, date::text AS date
     FROM bank_transactions
     WHERE date >= $1 AND date <= $2 AND amount > 0
     ORDER BY date DESC`,
    [periodStartStr, periodEndStr]
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

  const mrr_by_client = bankMrr.by_client

  const alertsFinal = buildFinanceAlerts({
    bankConnection,
    collectionGap,
    collectionRatePct,
    pendingInvoices,
    draftCount,
    runwayMonths,
    cashBalance,
    highCostProjects: [],
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
    period_label,
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
    project_economics: [],
    generated_at: now.toISOString(),
  }
}
