import {
  PAYMENT_BUCKET_LABELS,
  parsePaymentConcept,
  type PaymentBucket,
} from './payment-concepts'

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

/** Mínimo de repeticiones según tipo de gasto */
function minOccurrencesForBucket(bucket: PaymentBucket): number {
  if (bucket === 'payroll') return 2
  if (bucket === 'platform') return 2
  if (bucket === 'developer') return 1
  return 2
}

/**
 * Detecta gastos recurrentes usando conceptos bancarios normalizados.
 */
export function detectRecurringExpenses(expenses: ExpenseInput[]): RecurringExpenseRow[] {
  const byKey = new Map<
    string,
    {
      label: string
      bucket: PaymentBucket
      bucket_label: string
      items: Array<{ date: string; amount: number }>
    }
  >()

  for (const e of expenses) {
    const abs = Math.abs(e.amount)
    if (abs <= 0) continue
    const parsed = parsePaymentConcept(e.description || 'Sin concepto')
    if (!byKey.has(parsed.grouping_key)) {
      byKey.set(parsed.grouping_key, {
        label: parsed.display_label,
        bucket: parsed.bucket,
        bucket_label: parsed.bucket_label,
        items: [],
      })
    }
    byKey.get(parsed.grouping_key)!.items.push({ date: e.date.slice(0, 10), amount: abs })
  }

  const rows: RecurringExpenseRow[] = []

  for (const [vendor_key, group] of Array.from(byKey.entries())) {
    const minOcc = minOccurrencesForBucket(group.bucket)
    if (group.items.length < minOcc) continue

    group.items.sort((a, b) => a.date.localeCompare(b.date))
    const dates = group.items.map((i) => new Date(i.date).getTime())
    const intervals: number[] = []
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24))
    }
    const avgInterval =
      intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 30
    const frequency =
      group.bucket === 'payroll' && intervals.length === 0
        ? 'Mensual'
        : inferFrequency(avgInterval)
    const amounts = group.items.map((i) => i.amount)
    const average_amount =
      Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100
    const monthly_equivalent = Math.round(monthlyEquivalent(average_amount, frequency) * 100) / 100

    rows.push({
      vendor_key,
      label: group.label,
      bucket: group.bucket,
      bucket_label: group.bucket_label,
      category_id: group.bucket,
      category_label: group.bucket_label,
      frequency,
      average_amount,
      monthly_equivalent,
      annual_cost: Math.round(monthly_equivalent * 12 * 100) / 100,
      count: group.items.length,
      last_date: group.items[group.items.length - 1].date,
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
