import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import type { CategorizedTransaction } from './categorize-transactions'
import { isPaymentBucket } from './payment-concepts'
import { clampPeriodStart } from './period-presets'

export interface ExpenseLoadResult {
  transactions: CategorizedTransaction[]
  bank_count: number
  manual_count: number
  source_label: string
}

export type ExpenseLoadMode = 'bank_only' | 'crm_extras'

/**
 * Gastos para analítica del dashboard.
 * Por defecto SOLO banco: evita doble conteo (mismo pago en extracto + CRM).
 * `crm_extras` añade manuales/nóminas/fijos sin dedupe (solo para pantallas CRM dedicadas).
 */
export async function loadExpenseTransactionsForPeriod(
  start: Date,
  end: Date,
  mode: ExpenseLoadMode = 'bank_only'
): Promise<ExpenseLoadResult> {
  const startStr = clampPeriodStart(start).toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)
  const transactions: CategorizedTransaction[] = []
  let bank_count = 0
  let manual_count = 0

  try {
    const bankResult = await query<{
      description: string
      amount: string
      date: string
      expense_bucket: string | null
    }>(
      `SELECT description, amount, date::text AS date, expense_bucket
       FROM bank_transactions
       WHERE date >= $1 AND date <= $2 AND amount < 0
       ORDER BY date DESC`,
      [startStr, endStr]
    ).catch(async () => {
      const fallback = await query<{ description: string; amount: string; date: string }>(
        `SELECT description, amount, date::text AS date
         FROM bank_transactions
         WHERE date >= $1 AND date <= $2 AND amount < 0
         ORDER BY date DESC`,
        [startStr, endStr]
      )
      return {
        rows: fallback.rows.map((r) => ({ ...r, expense_bucket: null as string | null })),
      }
    })
    for (const r of bankResult.rows) {
      bank_count++
      transactions.push({
        description: r.description || 'Movimiento bancario',
        amount: Number(r.amount),
        date: r.date,
        expense_bucket: isPaymentBucket(r.expense_bucket) ? r.expense_bucket : null,
      })
    }
  } catch {
    // tabla bank_transactions puede no existir
  }

  if (mode === 'crm_extras') {
    try {
      const [manualExpenses, salaries, fixedActive] = await Promise.all([
        prisma.expense.findMany({
          where: {
            deleted_at: null,
            OR: [
              { date_start: { gte: start, lte: end } },
              { date_end: { gte: start, lte: end } },
              {
                AND: [{ date_start: { lte: start } }, { date_end: { gte: end } }],
              },
            ],
          },
          select: { name: true, total_amount: true, person_name: true, date_start: true },
        }),
        prisma.salary.findMany({
          where: { deleted_at: null, date: { gte: start, lte: end } },
          select: { person_name: true, amount: true, date: true },
        }),
        prisma.fixedExpense.findMany({
          where: { deleted_at: null, is_active: true },
          select: { name: true, amount: true },
        }),
      ])

      for (const e of manualExpenses) {
        manual_count++
        const desc = [e.name, e.person_name].filter(Boolean).join(' — ')
        transactions.push({
          description: desc || e.name,
          amount: -Math.abs(Number(e.total_amount)),
          date: e.date_start.toISOString().slice(0, 10),
        })
      }

      for (const s of salaries) {
        manual_count++
        transactions.push({
          description: `Nómina ${s.person_name}`,
          amount: -Math.abs(Number(s.amount)),
          date: s.date.toISOString().slice(0, 10),
        })
      }

      const monthsInRange = Math.max(
        1,
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      )
      for (const f of fixedActive) {
        manual_count++
        const total = Math.abs(Number(f.amount)) * monthsInRange
        transactions.push({
          description: `${f.name} (fijo mensual)`,
          amount: -total,
          date: startStr,
        })
      }
    } catch {
      // tablas financieras pueden no existir
    }
  }

  const source_label =
    mode === 'bank_only'
      ? bank_count > 0
        ? 'Solo movimientos bancarios (sin doble conteo CRM)'
        : 'Sin salidas en banco en este período'
      : bank_count > 0 && manual_count > 0
        ? 'Banco + gastos registrados en CRM'
        : bank_count > 0
          ? 'Movimientos bancarios'
          : manual_count > 0
            ? 'Gastos manuales, nóminas y fijos del CRM'
            : 'Sin datos — conecta el banco o registra gastos'

  return { transactions, bank_count, manual_count, source_label }
}

/** @deprecated use loadExpenseTransactionsForPeriod */
export async function loadExpenseTransactionsYtd(
  startYTD: Date
): Promise<ExpenseLoadResult> {
  const end = new Date()
  return loadExpenseTransactionsForPeriod(startYTD, end, 'bank_only')
}

export async function loadMrrByClient(): Promise<
  Array<{ name: string; amount: number }>
> {
  const { loadMrrByClientFromBank } = await import('./mrr-from-bank')
  return loadMrrByClientFromBank()
}

export async function countUnclassifiedExpenses(
  start: Date,
  end?: Date
): Promise<{
  unlinked_manual: number
  unlinked_manual_total: number
  bank_without_manual: number
}> {
  const startStr = clampPeriodStart(start).toISOString().slice(0, 10)
  const endStr = (end ?? new Date()).toISOString().slice(0, 10)
  let unlinked_manual = 0
  let unlinked_manual_total = 0
  let bank_without_manual = 0

  try {
    const orphans = await prisma.expense.findMany({
      where: {
        deleted_at: null,
        date_start: { gte: start, lte: end ?? new Date() },
        AND: [{ OR: [{ project: null }, { project: '' }] }, { OR: [{ client_name: null }, { client_name: '' }] }],
      },
      select: { total_amount: true },
    })
    unlinked_manual = orphans.length
    unlinked_manual_total = orphans.reduce((s, e) => s + Number(e.total_amount), 0)
  } catch {
    // ignore
  }

  // Sin columna bank_transaction_id en expenses: no estimamos huérfanos banco↔CRM
  bank_without_manual = 0

  return { unlinked_manual, unlinked_manual_total, bank_without_manual }
}
