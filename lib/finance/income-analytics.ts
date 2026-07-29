import { categorizeIncome } from './categorize-transactions'
import { resolveIncomeClientLabel, isIncomeOtrosGroup } from './income-client-resolve'
import type { CategorySlice, MrrClientRow } from './types'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export interface IncomeInput {
  description: string
  amount: number
  date: string
  is_recurring_income: boolean
  linked_client_name?: string
  linked_invoice_subtotal?: number
  linked_invoice_iva?: number
}

export interface ClientIncomeRow {
  client_key: string
  label: string
  total: number
  payment_count: number
  percentage: number
  recurring_total: number
}

export interface MonthlyIncomePoint {
  month: string
  month_key: string
  total: number
  recurring: number
  one_off: number
}

export interface IncomeAnalyticsTotals {
  period_total: number
  matched_total: number
  unmatched_total: number
  matched_count: number
  unmatched_count: number
  mrr_monthly: number
  recurring_count: number
  base_collected: number
  iva_collected: number
  invoiced_period: number
  invoiced_base: number
  invoiced_iva: number
  has_iva_data: boolean
  global_collection_pct: number | null
  otros_income: number
}

export interface ClientCollectionRow {
  client_key: string
  label: string
  invoiced: number
  collected: number
  pending: number
  collection_pct: number | null
  invoice_count: number
  collected_invoice_count: number
}

export interface IncomeAnalytics {
  client_breakdown: ClientIncomeRow[]
  client_collection: ClientCollectionRow[]
  monthly_timeline: MonthlyIncomePoint[]
  type_breakdown: CategorySlice[]
  mrr_by_client: MrrClientRow[]
  totals: IncomeAnalyticsTotals
}

function monthLabelFromKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${MONTH_LABELS[m - 1]} ${String(y).slice(2)}`
}

export function buildClientBreakdown(incomes: IncomeInput[]): ClientIncomeRow[] {
  const byKey = new Map<
    string,
    { label: string; amounts: number[]; recurring: number }
  >()

  for (const row of incomes) {
    const abs = Math.abs(row.amount)
    if (abs <= 0) continue
    const label = resolveIncomeClientLabel(row)
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 48) || 'otro'
    if (!byKey.has(key)) {
      byKey.set(key, { label, amounts: [], recurring: 0 })
    }
    const bucket = byKey.get(key)!
    bucket.amounts.push(abs)
    if (row.is_recurring_income) bucket.recurring += abs
  }

  const grandTotal = incomes.reduce((s, e) => s + Math.abs(e.amount), 0)

  return Array.from(byKey.entries())
    .map(([client_key, data]) => {
      const total = Math.round(data.amounts.reduce((a, b) => a + b, 0) * 100) / 100
      return {
        client_key,
        label: data.label,
        total,
        payment_count: data.amounts.length,
        percentage: grandTotal > 0 ? Math.round((total / grandTotal) * 1000) / 10 : 0,
        recurring_total: Math.round(data.recurring * 100) / 100,
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => {
      if (isIncomeOtrosGroup(a.label) && !isIncomeOtrosGroup(b.label)) return 1
      if (!isIncomeOtrosGroup(a.label) && isIncomeOtrosGroup(b.label)) return -1
      return b.total - a.total
    })
}

/** Adapta cobros por cliente al donut del overview (top N + resto). */
export function clientBreakdownToCategorySlices(
  rows: ClientIncomeRow[],
  opts: { maxSlices?: number } = {}
): CategorySlice[] {
  const maxSlices = opts.maxSlices ?? 8
  if (rows.length === 0) return []

  const toSlice = (r: ClientIncomeRow): CategorySlice => ({
    id: r.client_key,
    label: r.label,
    amount: r.total,
    percentage: r.percentage,
    transaction_count: r.payment_count,
    avg_transaction:
      r.payment_count > 0 ? Math.round((r.total / r.payment_count) * 100) / 100 : 0,
    top_descriptions: [],
  })

  if (rows.length <= maxSlices) {
    return rows.map(toSlice)
  }

  const head = rows.slice(0, maxSlices - 1)
  const tail = rows.slice(maxSlices - 1)
  const slices = head.map(toSlice)
  const amount = Math.round(tail.reduce((s, r) => s + r.total, 0) * 100) / 100
  const payment_count = tail.reduce((s, r) => s + r.payment_count, 0)
  const grand = rows.reduce((s, r) => s + r.total, 0)
  slices.push({
    id: '_resto_clientes',
    label: `Resto (${tail.length})`,
    amount,
    percentage: grand > 0 ? Math.round((amount / grand) * 1000) / 10 : 0,
    transaction_count: payment_count,
    avg_transaction: payment_count > 0 ? Math.round((amount / payment_count) * 100) / 100 : 0,
    top_descriptions: tail.slice(0, 3).map((r) => r.label),
  })
  return slices
}

export function buildMonthlyIncomeTimeline(incomes: IncomeInput[]): MonthlyIncomePoint[] {
  const byMonth = new Map<string, { total: number; recurring: number }>()

  for (const row of incomes) {
    const abs = Math.abs(row.amount)
    if (abs <= 0) continue
    const monthKey = row.date.slice(0, 7)
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, { total: 0, recurring: 0 })
    }
    const m = byMonth.get(monthKey)!
    m.total += abs
    if (row.is_recurring_income) m.recurring += abs
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month_key, data]) => ({
      month: monthLabelFromKey(month_key),
      month_key,
      total: Math.round(data.total * 100) / 100,
      recurring: Math.round(data.recurring * 100) / 100,
      one_off: Math.round((data.total - data.recurring) * 100) / 100,
    }))
}

function buildMrrByClient(incomes: IncomeInput[]): MrrClientRow[] {
  const byClientMonth = new Map<string, Map<string, number>>()

  for (const row of incomes.filter((i) => i.is_recurring_income)) {
    const name = resolveIncomeClientLabel(row)
    if (isIncomeOtrosGroup(name)) continue
    const mk = row.date.slice(0, 7)
    const amount = Math.abs(row.amount)
    if (!byClientMonth.has(name)) byClientMonth.set(name, new Map())
    const months = byClientMonth.get(name)!
    months.set(mk, (months.get(mk) ?? 0) + amount)
  }

  const rows: MrrClientRow[] = []
  for (const [name, months] of Array.from(byClientMonth.entries())) {
    const monthlyTotals = Array.from(months.values())
    const avg =
      Math.round((monthlyTotals.reduce((s, v) => s + v, 0) / monthlyTotals.length) * 100) / 100
    if (avg > 0) rows.push({ name, amount: avg })
  }

  return rows.sort((a, b) => b.amount - a.amount)
}

export interface InvoiceCollectionInput {
  client_name: string
  total: number
  subtotal: number
  iva: number
  bank_transaction_id: string | null
}

function normalizeClientKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 48) || 'otro'
}

/** Facturado enviado vs cobro vinculado a extracto, por cliente (sin plataformas) */
export function buildClientCollectionRates(
  invoices: InvoiceCollectionInput[],
  periodIncomes: IncomeInput[]
): ClientCollectionRow[] {
  const byKey = new Map<
    string,
    {
      label: string
      invoiced: number
      collected: number
      invoice_count: number
      collected_invoice_count: number
    }
  >()

  for (const inv of invoices) {
    const label = inv.client_name?.trim() || 'Sin cliente'
    if (isIncomeOtrosGroup(label)) continue
    const key = normalizeClientKey(label)
    if (!byKey.has(key)) {
      byKey.set(key, {
        label,
        invoiced: 0,
        collected: 0,
        invoice_count: 0,
        collected_invoice_count: 0,
      })
    }
    const row = byKey.get(key)!
    const total = Math.abs(Number(inv.total))
    row.invoiced += total
    row.invoice_count += 1
    if (inv.bank_transaction_id) {
      row.collected += total
      row.collected_invoice_count += 1
    }
  }

  for (const income of periodIncomes) {
    const label = resolveIncomeClientLabel(income)
    if (isIncomeOtrosGroup(label)) continue
    const key = normalizeClientKey(label)
    if (byKey.has(key)) continue
    const amount = Math.abs(income.amount)
    if (amount <= 0) continue
    byKey.set(key, {
      label,
      invoiced: 0,
      collected: amount,
      invoice_count: 0,
      collected_invoice_count: 0,
    })
  }

  return Array.from(byKey.entries())
    .map(([client_key, data]) => {
      const invoiced = Math.round(data.invoiced * 100) / 100
      const collected = Math.round(data.collected * 100) / 100
      const pending = Math.round(Math.max(0, invoiced - collected) * 100) / 100
      const collection_pct =
        invoiced > 0 ? Math.round((collected / invoiced) * 1000) / 10 : null
      return {
        client_key,
        label: data.label,
        invoiced,
        collected,
        pending,
        collection_pct,
        invoice_count: data.invoice_count,
        collected_invoice_count: data.collected_invoice_count,
      }
    })
    .filter((r) => r.invoiced > 0 || r.collected > 0)
    .sort((a, b) => {
      const pctA = a.collection_pct ?? -1
      const pctB = b.collection_pct ?? -1
      if (pctA !== pctB) return pctA - pctB
      return b.invoiced - a.invoiced
    })
}

function buildIncomeTotals(
  periodIncomes: IncomeInput[],
  periodInvoices: InvoiceCollectionInput[]
): IncomeAnalyticsTotals {
  const matched = periodIncomes.filter((i) => i.linked_client_name)
  const unmatched = periodIncomes.filter((i) => !i.linked_client_name)

  let base_collected = 0
  let iva_collected = 0
  let has_iva_data = false
  for (const row of matched) {
    if (row.linked_invoice_subtotal != null && row.linked_invoice_subtotal > 0) {
      base_collected += Math.abs(row.linked_invoice_subtotal)
    }
    if (row.linked_invoice_iva != null && row.linked_invoice_iva > 0) {
      iva_collected += Math.abs(row.linked_invoice_iva)
      has_iva_data = true
    }
  }

  const invoiced_period = periodInvoices.reduce((s, inv) => s + Math.abs(inv.total), 0)

  const linkedPeriodInvoices = periodInvoices.filter((inv) => inv.bank_transaction_id)
  const invoiced_base = linkedPeriodInvoices.reduce((s, inv) => s + Math.abs(inv.subtotal), 0)
  const invoiced_iva = has_iva_data
    ? linkedPeriodInvoices.reduce((s, inv) => s + Math.abs(inv.iva), 0)
    : 0

  const collectedFromInvoices = periodInvoices
    .filter((inv) => inv.bank_transaction_id)
    .reduce((s, inv) => s + Math.abs(inv.total), 0)

  const global_collection_pct =
    invoiced_period > 0
      ? Math.round((collectedFromInvoices / invoiced_period) * 1000) / 10
      : null

  const otros_income = periodIncomes
    .filter((i) => isIncomeOtrosGroup(resolveIncomeClientLabel(i)))
    .reduce((s, i) => s + Math.abs(i.amount), 0)

  return {
    period_total: Math.round(periodIncomes.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    matched_total: Math.round(matched.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    unmatched_total: Math.round(unmatched.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    matched_count: matched.length,
    unmatched_count: unmatched.length,
    mrr_monthly: 0,
    recurring_count: periodIncomes.filter((i) => i.is_recurring_income).length,
    base_collected: Math.round(base_collected * 100) / 100,
    iva_collected: Math.round(iva_collected * 100) / 100,
    invoiced_period: Math.round(invoiced_period * 100) / 100,
    invoiced_base: Math.round(invoiced_base * 100) / 100,
    invoiced_iva: Math.round(invoiced_iva * 100) / 100,
    has_iva_data,
    global_collection_pct,
    otros_income: Math.round(otros_income * 100) / 100,
  }
}

export function buildIncomeAnalytics(
  timelineIncomes: IncomeInput[],
  periodIncomes: IncomeInput[],
  periodInvoices: InvoiceCollectionInput[] = []
): IncomeAnalytics {
  const type_breakdown = categorizeIncome(
    periodIncomes.map((i) => ({
      description: i.description,
      amount: i.amount,
      date: i.date,
    }))
  )

  const mrr_by_client = buildMrrByClient(timelineIncomes)
  const totals = buildIncomeTotals(periodIncomes, periodInvoices)
  totals.mrr_monthly = Math.round(mrr_by_client.reduce((s, c) => s + c.amount, 0) * 100) / 100

  return {
    client_breakdown: buildClientBreakdown(periodIncomes),
    client_collection: buildClientCollectionRates(periodInvoices, periodIncomes),
    monthly_timeline: buildMonthlyIncomeTimeline(timelineIncomes),
    type_breakdown,
    mrr_by_client,
    totals,
  }
}
