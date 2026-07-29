import {
  PAYMENT_BUCKET_LABELS,
  parsePaymentConcept,
  platformLabelFromDescription,
  type PaymentBucket,
} from './payment-concepts'
import {
  detectRecurringExpenses,
  recurringExpensesSummary,
  recurringOpsMonthly,
  isOpsRecurringBucket,
} from './recurring-expenses'
import type { RecurringExpensesSummary } from './types'
import type { CategorySlice } from './types'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export const BUCKET_CHART_COLORS: Record<PaymentBucket, string> = {
  platform: '#4F46E5',
  payroll: '#0F172A',
  developer: '#7C3AED',
  marketing: '#BE185D',
  professional: '#64748B',
  tax: '#B45309',
  other: '#CBD5E1',
}

const BUCKET_KEYS: PaymentBucket[] = [
  'platform',
  'payroll',
  'developer',
  'marketing',
  'professional',
  'tax',
  'other',
]

type ExpenseInput = {
  description: string
  amount: number
  date: string
  /** Override manual; si existe, manda sobre el parseo automático */
  expense_bucket?: PaymentBucket | null
}

function monthLabelFromKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${MONTH_LABELS[m - 1]} ${String(y).slice(2)}`
}

export interface MonthlyBucketPoint {
  month: string
  month_key: string
  platform: number
  payroll: number
  developer: number
  marketing: number
  professional: number
  tax: number
  other: number
  total: number
}

export interface ProjectSpendRow {
  project_id: string
  label: string
  total: number
  monthly_avg: number
  payment_count: number
  developers: string[]
}

export interface CuttableExpenseItem {
  vendor_key: string
  label: string
  bucket: PaymentBucket
  monthly_equivalent: number
  annual_cost: number
  detection_source: 'concept' | 'pattern' | 'recurrence'
  months_active: number
}

export interface ExpenseAnalyticsTotals {
  period_total: number
  recurring_monthly: number
  /** SaaS + marketing + servicios profesionales (equiv. mensual detectado) */
  recurring_ops_monthly: number
  /** Media de gasto ops real: suma meses / meses con gasto */
  recurring_ops_avg: number
  /** Gasto ops del último mes del rango de analítica */
  recurring_ops_last_month: number
  recurring_ops_last_month_label: string
  platform_period: number
  payroll_period: number
  developer_period: number
  marketing_period: number
}

export interface OpsRecurringItem {
  date: string
  description: string
  amount: number
  bucket: PaymentBucket
  bucket_label: string
}

export interface OpsRecurringMonthPoint {
  month: string
  month_key: string
  total: number
  platform: number
  marketing: number
  professional: number
  items: OpsRecurringItem[]
}

export interface OpsRecurringSeries {
  months: OpsRecurringMonthPoint[]
  average_monthly: number
  last_month_total: number
  last_month_label: string
  last_month_key: string
  months_with_spend: number
}

export interface VendorSpendRow {
  vendor_key: string
  label: string
  bucket: PaymentBucket
  bucket_label: string
  total: number
  payment_count: number
  percentage: number
}

export interface ExpenseAnalytics {
  bucket_breakdown: CategorySlice[]
  monthly_timeline: MonthlyBucketPoint[]
  project_spend: ProjectSpendRow[]
  vendor_spend: VendorSpendRow[]
  recurring: RecurringExpensesSummary
  cuttable_items: CuttableExpenseItem[]
  ops_recurring: OpsRecurringSeries
  totals: ExpenseAnalyticsTotals
}

function buildRecurrencePromotions(expenses: ExpenseInput[]): Map<string, PaymentBucket> {
  const byKey = new Map<string, { bucket: PaymentBucket; months: Set<string> }>()

  for (const e of expenses) {
    if (e.expense_bucket) continue
    const parsed = parsePaymentConcept(e.description || 'Sin concepto')
    if (!byKey.has(parsed.grouping_key)) {
      byKey.set(parsed.grouping_key, { bucket: parsed.bucket, months: new Set() })
    }
    byKey.get(parsed.grouping_key)!.months.add(e.date.slice(0, 7))
  }

  const promotions = new Map<string, PaymentBucket>()
  for (const [key, data] of Array.from(byKey.entries())) {
    if (data.months.size >= 2 && data.bucket === 'other') {
      promotions.set(key, 'platform')
    }
  }
  return promotions
}

function resolveBucket(
  expense: ExpenseInput,
  promotions: Map<string, PaymentBucket>
): PaymentBucket {
  if (expense.expense_bucket) return expense.expense_bucket
  const parsed = parsePaymentConcept(expense.description || 'Sin concepto')
  return promotions.get(parsed.grouping_key) ?? parsed.bucket
}

export function buildMonthlyBucketTimeline(expenses: ExpenseInput[]): MonthlyBucketPoint[] {
  const promotions = buildRecurrencePromotions(expenses)
  const byMonth = new Map<string, Record<PaymentBucket, number>>()

  for (const e of expenses) {
    const abs = Math.abs(e.amount)
    if (abs <= 0) continue
    const monthKey = e.date.slice(0, 7)
    const bucketKey = resolveBucket(e, promotions)
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, {
        platform: 0,
        payroll: 0,
        developer: 0,
        marketing: 0,
        professional: 0,
        tax: 0,
        other: 0,
      })
    }
    const monthBuckets = byMonth.get(monthKey)!
    monthBuckets[bucketKey] += abs
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month_key, buckets]) => {
      const total = BUCKET_KEYS.reduce((s, k) => s + buckets[k], 0)
      return {
        month: monthLabelFromKey(month_key),
        month_key,
        platform: Math.round(buckets.platform * 100) / 100,
        payroll: Math.round(buckets.payroll * 100) / 100,
        developer: Math.round(buckets.developer * 100) / 100,
        marketing: Math.round(buckets.marketing * 100) / 100,
        professional: Math.round(buckets.professional * 100) / 100,
        tax: Math.round(buckets.tax * 100) / 100,
        other: Math.round(buckets.other * 100) / 100,
        total: Math.round(total * 100) / 100,
      }
    })
}

export function buildBucketBreakdown(expenses: ExpenseInput[]): CategorySlice[] {
  const promotions = buildRecurrencePromotions(expenses)
  const buckets = new Map<PaymentBucket, { amounts: number[]; descriptions: string[] }>()

  for (const key of BUCKET_KEYS) {
    buckets.set(key, { amounts: [], descriptions: [] })
  }

  for (const e of expenses) {
    const abs = Math.abs(e.amount)
    if (abs <= 0) continue
    const bucketKey = resolveBucket(e, promotions)
    const bucket = buckets.get(bucketKey)!
    bucket.amounts.push(abs)
    if (e.description?.trim()) bucket.descriptions.push(e.description.trim())
  }

  const total = expenses.reduce((s, e) => s + Math.abs(e.amount), 0)
  const slices: CategorySlice[] = []

  for (const bucket of BUCKET_KEYS) {
    const data = buckets.get(bucket)!
    if (data.amounts.length === 0) continue
    const amount = data.amounts.reduce((a, b) => a + b, 0)
    const descFreq = new Map<string, number>()
    for (const d of data.descriptions) descFreq.set(d, (descFreq.get(d) ?? 0) + 1)
    const top_descriptions = Array.from(descFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d)

    slices.push({
      id: bucket,
      label: PAYMENT_BUCKET_LABELS[bucket],
      amount: Math.round(amount * 100) / 100,
      percentage: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      transaction_count: data.amounts.length,
      avg_transaction: Math.round((amount / data.amounts.length) * 100) / 100,
      top_descriptions,
    })
  }

  return slices.sort((a, b) => b.amount - a.amount)
}

export function buildProjectSpend(expenses: ExpenseInput[]): ProjectSpendRow[] {
  const byProject = new Map<
    string,
    { total: number; dates: string[]; developers: Set<string> }
  >()

  for (const e of expenses) {
    const abs = Math.abs(e.amount)
    if (abs <= 0) continue
    const parsed = parsePaymentConcept(e.description || '')
    if (parsed.bucket !== 'developer' || !parsed.project_id) continue

    const pid = parsed.project_id
    if (!byProject.has(pid)) {
      byProject.set(pid, { total: 0, dates: [], developers: new Set() })
    }
    const row = byProject.get(pid)!
    row.total += abs
    row.dates.push(e.date.slice(0, 10))
    if (parsed.developer_name) row.developers.add(parsed.developer_name)
  }

  return Array.from(byProject.entries())
    .map(([project_id, data]) => {
      const months = new Set(data.dates.map((d) => d.slice(0, 7))).size
      const monthly_avg = months > 0 ? data.total / months : data.total
      return {
        project_id,
        label: project_id,
        total: Math.round(data.total * 100) / 100,
        monthly_avg: Math.round(monthly_avg * 100) / 100,
        payment_count: data.dates.length,
        developers: Array.from(data.developers),
      }
    })
    .sort((a, b) => b.total - a.total)
}

export function buildVendorSpend(expenses: ExpenseInput[]): VendorSpendRow[] {
  const promotions = buildRecurrencePromotions(expenses)
  const byKey = new Map<
    string,
    { label: string; bucket: PaymentBucket; amounts: number[] }
  >()

  for (const e of expenses) {
    const abs = Math.abs(e.amount)
    if (abs <= 0) continue
    const parsed = parsePaymentConcept(e.description || 'Sin concepto')
    const bucket = resolveBucket(e, promotions)
    let label = parsed.display_label
    if (e.expense_bucket) {
      label = `${PAYMENT_BUCKET_LABELS[e.expense_bucket]} · ${parsed.display_label}`
    } else if (bucket === 'platform' && parsed.bucket === 'other') {
      label = platformLabelFromDescription(e.description || '')
    }

    const groupingKey = e.expense_bucket
      ? `manual:${e.expense_bucket}:${parsed.grouping_key}`
      : parsed.grouping_key

    if (!byKey.has(groupingKey)) {
      byKey.set(groupingKey, { label, bucket, amounts: [] })
    }
    const row = byKey.get(groupingKey)!
    if (bucket === 'platform') row.bucket = 'platform'
    row.amounts.push(abs)
  }

  const grandTotal = expenses.reduce((s, e) => s + Math.abs(e.amount), 0)

  return Array.from(byKey.entries())
    .map(([vendor_key, data]) => {
      const total = Math.round(data.amounts.reduce((a, b) => a + b, 0) * 100) / 100
      return {
        vendor_key,
        label: data.label,
        bucket: data.bucket,
        bucket_label: PAYMENT_BUCKET_LABELS[data.bucket],
        total,
        payment_count: data.amounts.length,
        percentage: grandTotal > 0 ? Math.round((total / grandTotal) * 1000) / 10 : 0,
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

export function bucketTotalFromBreakdown(
  breakdown: CategorySlice[],
  bucket: PaymentBucket
): number {
  return breakdown.find((s) => s.id === bucket)?.amount ?? 0
}

/** Meses naturales cubiertos por el rango (mín. 1) */
export function countMonthsInPeriod(start: Date, end: Date): number {
  return Math.max(
    1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  )
}

function buildCuttableItems(
  recurring: ReturnType<typeof recurringExpensesSummary>
): CuttableExpenseItem[] {
  return recurring.items
    .filter((r) => r.bucket === 'platform' || r.bucket === 'marketing')
    .map((r) => ({
      vendor_key: r.vendor_key,
      label: r.label,
      bucket: r.bucket,
      monthly_equivalent: r.monthly_equivalent,
      annual_cost: r.annual_cost,
      detection_source: r.detection_source,
      months_active: r.months_active,
    }))
}

/**
 * Serie mensual real de SaaS + marketing + servicios profesionales.
 * Media = suma de meses / meses con gasto (>0).
 * Último mes = el más reciente del rango analizado.
 */
export function buildOpsRecurringSeries(expenses: ExpenseInput[]): OpsRecurringSeries {
  const promotions = buildRecurrencePromotions(expenses)
  const byMonth = new Map<string, OpsRecurringMonthPoint>()

  let minKey = ''
  let maxKey = ''
  for (const e of expenses) {
    const month_key = e.date.slice(0, 7)
    if (!month_key || month_key.length < 7) continue
    if (!minKey || month_key < minKey) minKey = month_key
    if (!maxKey || month_key > maxKey) maxKey = month_key
  }

  const ensureMonth = (month_key: string) => {
    if (!byMonth.has(month_key)) {
      byMonth.set(month_key, {
        month: monthLabelFromKey(month_key),
        month_key,
        total: 0,
        platform: 0,
        marketing: 0,
        professional: 0,
        items: [],
      })
    }
  }

  if (minKey && maxKey) {
    const [sy, sm] = minKey.split('-').map(Number)
    const [ey, em] = maxKey.split('-').map(Number)
    let y = sy
    let m = sm
    while (y < ey || (y === ey && m <= em)) {
      ensureMonth(`${y}-${String(m).padStart(2, '0')}`)
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
  }

  for (const e of expenses) {
    const abs = Math.abs(e.amount)
    if (abs <= 0) continue
    const bucket = resolveBucket(e, promotions)
    if (!isOpsRecurringBucket(bucket)) continue

    const month_key = e.date.slice(0, 7)
    ensureMonth(month_key)
    const row = byMonth.get(month_key)!
    row.total += abs
    if (bucket === 'platform') row.platform += abs
    else if (bucket === 'marketing') row.marketing += abs
    else row.professional += abs
    row.items.push({
      date: e.date.slice(0, 10),
      description: e.description?.trim() || 'Sin concepto',
      amount: Math.round(abs * 100) / 100,
      bucket,
      bucket_label: PAYMENT_BUCKET_LABELS[bucket],
    })
  }

  const months = Array.from(byMonth.values())
    .sort((a, b) => a.month_key.localeCompare(b.month_key))
    .map((m) => ({
      ...m,
      total: Math.round(m.total * 100) / 100,
      platform: Math.round(m.platform * 100) / 100,
      marketing: Math.round(m.marketing * 100) / 100,
      professional: Math.round(m.professional * 100) / 100,
      items: m.items.sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date)),
    }))

  const monthsWithSpend = months.filter((m) => m.total > 0)
  const average_monthly =
    monthsWithSpend.length > 0
      ? Math.round(
          (monthsWithSpend.reduce((s, m) => s + m.total, 0) / monthsWithSpend.length) * 100
        ) / 100
      : 0

  const last = months.length > 0 ? months[months.length - 1] : null

  return {
    months,
    average_monthly,
    last_month_total: last?.total ?? 0,
    last_month_label: last?.month ?? '—',
    last_month_key: last?.month_key ?? '',
    months_with_spend: monthsWithSpend.length,
  }
}

export function buildExpenseAnalytics(
  expenses: ExpenseInput[],
  periodExpenses?: ExpenseInput[]
): ExpenseAnalytics {
  const recurringItems = detectRecurringExpenses(expenses)
  const recurring = recurringExpensesSummary(recurringItems)
  const period = periodExpenses ?? expenses
  const breakdown = buildBucketBreakdown(period)
  const ops_recurring = buildOpsRecurringSeries(expenses)

  return {
    bucket_breakdown: breakdown,
    monthly_timeline: buildMonthlyBucketTimeline(expenses),
    project_spend: buildProjectSpend(period),
    vendor_spend: buildVendorSpend(period),
    recurring,
    cuttable_items: buildCuttableItems(recurring),
    ops_recurring,
    totals: {
      period_total: Math.round(expenses.reduce((s, e) => s + Math.abs(e.amount), 0) * 100) / 100,
      recurring_monthly: recurring.monthly_total,
      recurring_ops_monthly: recurringOpsMonthly(recurringItems),
      recurring_ops_avg: ops_recurring.average_monthly,
      recurring_ops_last_month: ops_recurring.last_month_total,
      recurring_ops_last_month_label: ops_recurring.last_month_label,
      platform_period: bucketTotalFromBreakdown(breakdown, 'platform'),
      payroll_period: bucketTotalFromBreakdown(breakdown, 'payroll'),
      developer_period: bucketTotalFromBreakdown(breakdown, 'developer'),
      marketing_period: bucketTotalFromBreakdown(breakdown, 'marketing'),
    },
  }
}
