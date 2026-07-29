import {
  PAYMENT_BUCKET_LABELS,
  parsePaymentConcept,
  platformLabelFromDescription,
  type PaymentBucket,
} from './payment-concepts'

export type DetectionSource = 'concept' | 'pattern' | 'recurrence'

export interface RecurringExpenseRow {
  vendor_key: string
  label: string
  bucket: PaymentBucket
  bucket_label: string
  category_id: string
  category_label: string
  frequency: string
  average_amount: number
  monthly_equivalent: number
  annual_cost: number
  count: number
  last_date: string
  months_active: number
  detection_source: DetectionSource
}

export interface RecurringExpenseGroup {
  bucket: PaymentBucket
  label: string
  monthly_total: number
  annual_total: number
  count: number
  items: RecurringExpenseRow[]
}

type ExpenseInput = {
  description: string
  amount: number
  date: string
  expense_bucket?: PaymentBucket | null
}

const BUCKET_ORDER: PaymentBucket[] = [
  'platform',
  'payroll',
  'developer',
  'marketing',
  'professional',
  'tax',
  'other',
]

/** Gastos recurrentes “operativos”: plataformas SaaS + marketing + servicios profesionales */
export const OPS_RECURRING_BUCKETS: PaymentBucket[] = [
  'platform',
  'marketing',
  'professional',
]

export function isOpsRecurringBucket(bucket: PaymentBucket): boolean {
  return OPS_RECURRING_BUCKETS.includes(bucket)
}

/** Equivalente mensual de SaaS + marketing + servicios profesionales */
export function recurringOpsMonthly(rows: RecurringExpenseRow[]): number {
  return (
    Math.round(
      rows
        .filter((r) => isOpsRecurringBucket(r.bucket))
        .reduce((s, r) => s + r.monthly_equivalent, 0) * 100
    ) / 100
  )
}

function inferFrequency(avgIntervalDays: number): string {
  if (avgIntervalDays >= 25 && avgIntervalDays <= 35) return 'Mensual'
  if (avgIntervalDays >= 85 && avgIntervalDays <= 95) return 'Trimestral'
  if (avgIntervalDays >= 175 && avgIntervalDays <= 185) return 'Semestral'
  if (avgIntervalDays >= 360 && avgIntervalDays <= 370) return 'Anual'
  return 'Variable'
}

function monthlyEquivalent(averageAmount: number, frequency: string): number {
  if (frequency === 'Trimestral') return averageAmount / 3
  if (frequency === 'Semestral') return averageAmount / 6
  if (frequency === 'Anual') return averageAmount / 12
  return averageAmount
}

function minOccurrencesForBucket(bucket: PaymentBucket): number {
  if (bucket === 'payroll') return 2
  if (bucket === 'platform') return 2
  if (bucket === 'developer') return 1
  return 2
}

function countDistinctMonths(dates: string[]): number {
  return new Set(dates.map((d) => d.slice(0, 7))).size
}

/**
 * Detecta gastos recurrentes.
 * - Transferencias propias: clasificación por concepto (NOMINA, DEV, MKT, PLT).
 * - Cargos de tarjeta: patrón conocido o recurrencia 2+ meses → plataforma.
 */
export function detectRecurringExpenses(expenses: ExpenseInput[]): RecurringExpenseRow[] {
  const byKey = new Map<
    string,
    {
      label: string
      bucket: PaymentBucket
      bucket_label: string
      detection_source: DetectionSource
      sample_description: string
      items: Array<{ date: string; amount: number }>
    }
  >()

  for (const e of expenses) {
    const abs = Math.abs(e.amount)
    if (abs <= 0) continue
    const parsed = parsePaymentConcept(e.description || 'Sin concepto')
    const bucket = e.expense_bucket ?? parsed.bucket
    const bucket_label = PAYMENT_BUCKET_LABELS[bucket]
    const groupingKey = e.expense_bucket
      ? `manual:${e.expense_bucket}:${parsed.grouping_key}`
      : parsed.grouping_key
    if (!byKey.has(groupingKey)) {
      byKey.set(groupingKey, {
        label: e.expense_bucket
          ? `${bucket_label} · ${parsed.display_label}`
          : parsed.display_label,
        bucket,
        bucket_label,
        detection_source: e.expense_bucket
          ? 'concept'
          : parsed.detection_source === 'none'
            ? 'pattern'
            : parsed.detection_source,
        sample_description: e.description || '',
        items: [],
      })
    }
    byKey.get(groupingKey)!.items.push({ date: e.date.slice(0, 10), amount: abs })
  }

  const rows: RecurringExpenseRow[] = []

  for (const [vendor_key, group] of Array.from(byKey.entries())) {
    const months_active = countDistinctMonths(group.items.map((i) => i.date))

    let bucket = group.bucket
    let bucket_label = group.bucket_label
    let label = group.label
    let detection_source = group.detection_source

    // Mismo concepto 2+ meses → muy probable plataforma/SaaS (cargo automático)
    if (months_active >= 2 && bucket === 'other') {
      bucket = 'platform'
      bucket_label = PAYMENT_BUCKET_LABELS.platform
      label = platformLabelFromDescription(group.sample_description)
      detection_source = 'recurrence'
    }

    const minOcc = minOccurrencesForBucket(bucket)
    if (group.items.length < minOcc && !(bucket === 'platform' && months_active >= 2)) continue

    group.items.sort((a, b) => a.date.localeCompare(b.date))
    const dates = group.items.map((i) => new Date(i.date).getTime())
    const intervals: number[] = []
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24))
    }
    const avgInterval =
      intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 30
    const frequency =
      bucket === 'payroll' && intervals.length === 0
        ? 'Mensual'
        : months_active >= 2 && bucket === 'platform' && intervals.length === 0
          ? 'Mensual'
          : inferFrequency(avgInterval)
    const amounts = group.items.map((i) => i.amount)
    const average_amount =
      Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100
    const monthly_equivalent = Math.round(monthlyEquivalent(average_amount, frequency) * 100) / 100

    rows.push({
      vendor_key,
      label,
      bucket,
      bucket_label,
      category_id: bucket,
      category_label: bucket_label,
      frequency,
      average_amount,
      monthly_equivalent,
      annual_cost: Math.round(monthly_equivalent * 12 * 100) / 100,
      count: group.items.length,
      last_date: group.items[group.items.length - 1].date,
      months_active,
      detection_source,
    })
  }

  return rows.sort((a, b) => b.monthly_equivalent - a.monthly_equivalent)
}

export function groupRecurringExpenses(rows: RecurringExpenseRow[]): RecurringExpenseGroup[] {
  const groups: RecurringExpenseGroup[] = []

  for (const bucket of BUCKET_ORDER) {
    const items = rows.filter((r) => r.bucket === bucket)
    if (items.length === 0) continue
    const monthly_total =
      Math.round(items.reduce((s, r) => s + r.monthly_equivalent, 0) * 100) / 100
    groups.push({
      bucket,
      label: PAYMENT_BUCKET_LABELS[bucket],
      monthly_total,
      annual_total: Math.round(monthly_total * 12 * 100) / 100,
      count: items.length,
      items,
    })
  }

  return groups
}

export function recurringExpensesSummary(rows: RecurringExpenseRow[]) {
  const monthly_total = Math.round(rows.reduce((s, r) => s + r.monthly_equivalent, 0) * 100) / 100
  const annual_total = Math.round(monthly_total * 12 * 100) / 100
  const groups = groupRecurringExpenses(rows)
  return { monthly_total, annual_total, count: rows.length, items: rows, groups }
}
