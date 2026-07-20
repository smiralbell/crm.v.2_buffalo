import { query } from '@/lib/db'
import { parsePaymentConcept } from './payment-concepts'

/**
 * Burn de plataformas/SaaS (Twilio, Cursor, PLT…): media mensual últimos N meses.
 * Usado para runway realista (caja ÷ gasto plataformas), no todo el extracto.
 */
export async function computePlatformMonthlyBurn(monthsLookback = 3): Promise<{
  avg_monthly: number
  months_with_data: number
  total_period: number
}> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsLookback - 1), 1)
  const startStr = start.toISOString().slice(0, 10)
  const endStr = now.toISOString().slice(0, 10)

  const result = await query<{ description: string; amount: string; date: string }>(
    `SELECT description, amount, date::text AS date
     FROM bank_transactions
     WHERE date >= $1 AND date <= $2 AND amount < 0
     ORDER BY date`,
    [startStr, endStr]
  ).catch(() => ({ rows: [] as { description: string; amount: string; date: string }[] }))

  const byMonth = new Map<string, number>()
  let total_period = 0

  for (const row of result.rows) {
    const parsed = parsePaymentConcept(row.description || '')
    if (parsed.bucket !== 'platform') continue
    const abs = Math.abs(Number(row.amount))
    const monthKey = String(row.date).slice(0, 7)
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + abs)
    total_period += abs
  }

  const months_with_data = byMonth.size
  const avg_monthly =
    months_with_data > 0
      ? Math.round((total_period / months_with_data) * 100) / 100
      : 0

  return {
    avg_monthly,
    months_with_data,
    total_period: Math.round(total_period * 100) / 100,
  }
}
