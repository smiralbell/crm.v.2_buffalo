import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import type { CategorizedTransaction } from './categorize-transactions'

export interface ExpenseLoadResult {
  transactions: CategorizedTransaction[]
  bank_count: number
  manual_count: number
  source_label: string
}

export async function loadExpenseTransactionsYtd(
  startYTD: Date
): Promise<ExpenseLoadResult> {
  const startStr = startYTD.toISOString().slice(0, 10)
  const transactions: CategorizedTransaction[] = []
  let bank_count = 0
  let manual_count = 0

  try {
    const bankResult = await query<{ description: string; amount: string; date: string }>(
      `SELECT description, amount, date::text AS date
       FROM bank_transactions
       WHERE date >= $1 AND amount < 0
       ORDER BY date DESC`,
      [startStr]
    )
    for (const r of bankResult.rows) {
      bank_count++
      transactions.push({
        description: r.description || 'Movimiento bancario',
        amount: Number(r.amount),
        date: r.date,
      })
    }
  } catch {
    // tabla bank_transactions puede no existir
  }

  try {
    const [manualExpenses, salaries, fixedActive] = await Promise.all([
      prisma.expense.findMany({
        where: {
          deleted_at: null,
          OR: [
            { date_start: { gte: startYTD } },
            { date_end: { gte: startYTD } },
          ],
        },
        select: { name: true, total_amount: true, person_name: true, date_start: true },
      }),
      prisma.salary.findMany({
        where: { deleted_at: null, date: { gte: startYTD } },
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

    const monthsElapsed = Math.max(1, new Date().getMonth() + 1)
    for (const f of fixedActive) {
      manual_count++
      const total = Math.abs(Number(f.amount)) * monthsElapsed
      transactions.push({
        description: `${f.name} (fijo mensual)`,
        amount: -total,
        date: startStr,
      })
    }
  } catch {
    // tablas financieras pueden no existir
  }

  const source_label =
    bank_count > 0 && manual_count > 0
      ? 'Banco + gastos registrados en CRM'
      : bank_count > 0
        ? 'Movimientos bancarios'
        : manual_count > 0
          ? 'Gastos manuales, nóminas y fijos del CRM'
          : 'Sin datos — conecta el banco o registra gastos'

  return { transactions, bank_count, manual_count, source_label }
}

export async function loadMrrByClient(): Promise<
  Array<{ name: string; amount: number }>
> {
  try {
    const rows = await prisma.$queryRaw<Array<{ name: string; amount: string | number }>>`
      SELECT name, monthly_fee_eur AS amount
      FROM proyectos
      WHERE monthly_fee_eur IS NOT NULL
        AND monthly_fee_eur > 0
        AND status NOT IN ('churned', 'paused')
      ORDER BY monthly_fee_eur DESC
      LIMIT 12
    `
    if (rows.length > 0) {
      return rows.map((r) => ({ name: r.name, amount: Number(r.amount) }))
    }
  } catch {
    // proyectos puede no existir
  }

  try {
    const incomes = await prisma.financialIncome.groupBy({
      by: ['client_name'],
      where: {
        deleted_at: null,
        status: { in: ['paid', 'pending'] },
        date: { gte: new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1) },
      },
      _sum: { total_amount: true },
    })
    const sorted = incomes
      .sort((a, b) => Number(b._sum.total_amount ?? 0) - Number(a._sum.total_amount ?? 0))
      .slice(0, 10)
    if (sorted.length > 0) {
      return sorted.map((i) => ({
        name: i.client_name,
        amount: Number(i._sum.total_amount ?? 0) / 3,
      }))
    }
  } catch {
    // fallback
  }

  return []
}

export async function countUnclassifiedExpenses(startYTD: Date): Promise<{
  unlinked_manual: number
  unlinked_manual_total: number
  bank_without_manual: number
}> {
  const startStr = startYTD.toISOString().slice(0, 10)
  let unlinked_manual = 0
  let unlinked_manual_total = 0
  let bank_without_manual = 0

  try {
    const orphans = await prisma.expense.findMany({
      where: {
        deleted_at: null,
        date_start: { gte: startYTD },
        project: null,
        client_name: null,
      },
      select: { total_amount: true },
    })
    unlinked_manual = orphans.length
    unlinked_manual_total = orphans.reduce((s, e) => s + Number(e.total_amount), 0)
  } catch {
    // ignore
  }

  try {
    const bankNeg = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM bank_transactions WHERE date >= $1 AND amount < 0`,
      [startStr]
    )
    const bankCount = Number(bankNeg.rows[0]?.cnt ?? 0)
    const manualCount = await prisma.expense.count({
      where: { deleted_at: null, date_start: { gte: startYTD } },
    })
    if (bankCount > 0 && manualCount === 0) {
      bank_without_manual = bankCount
    } else if (bankCount > manualCount * 2) {
      bank_without_manual = bankCount - manualCount
    }
  } catch {
    // ignore
  }

  return { unlinked_manual, unlinked_manual_total, bank_without_manual }
}
