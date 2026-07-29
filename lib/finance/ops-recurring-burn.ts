import { query } from '@/lib/db'
import { isPaymentBucket } from './payment-concepts'
import { buildOpsRecurringSeries } from './expense-analytics'

/**
 * Media mensual de gastos recurrentes operativos (SaaS + marketing + profesionales)
 * en los últimos N meses naturales.
 */
export async function computeOpsRecurringMonthlyAvg(monthsLookback = 3): Promise<{
  avg_monthly: number
  months_counted: number
  total_period: number
}> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsLookback - 1), 1)
  const startStr = start.toISOString().slice(0, 10)
  const endStr = now.toISOString().slice(0, 10)

  const result = await query<{
    description: string
    amount: string
    date: string
    expense_bucket: string | null
  }>(
    `SELECT description, amount, date::text AS date, expense_bucket
     FROM bank_transactions
     WHERE date >= $1 AND date <= $2 AND amount < 0
     ORDER BY date`,
    [startStr, endStr]
  ).catch(async () => {
    const fallback = await query<{ description: string; amount: string; date: string }>(
      `SELECT description, amount, date::text AS date
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2 AND amount < 0
       ORDER BY date`,
      [startStr, endStr]
    ).catch(() => ({ rows: [] as { description: string; amount: string; date: string }[] }))
    return {
      rows: fallback.rows.map((r) => ({ ...r, expense_bucket: null as string | null })),
    }
  })

  const expenses = result.rows.map((r) => ({
    description: r.description || '',
    amount: Number(r.amount),
    date: String(r.date).slice(0, 10),
    expense_bucket: isPaymentBucket(r.expense_bucket) ? r.expense_bucket : null,
  }))

  const series = buildOpsRecurringSeries(expenses)

  // Rellenar los N meses del lookback (aunque alguno vaya a 0)
  const monthKeys: string[] = []
  for (let i = monthsLookback - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const byKey = new Map(series.months.map((m) => [m.month_key, m.total]))
  const totals = monthKeys.map((k) => byKey.get(k) ?? 0)
  const total_period = Math.round(totals.reduce((s, n) => s + n, 0) * 100) / 100
  const avg_monthly =
    monthKeys.length > 0 ? Math.round((total_period / monthKeys.length) * 100) / 100 : 0

  return {
    avg_monthly,
    months_counted: monthKeys.length,
    total_period,
  }
}
