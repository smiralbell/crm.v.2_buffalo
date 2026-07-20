import { format, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { query } from '@/lib/db'
import { prisma } from '@/lib/prisma'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export interface FiscalMonthlyRow {
  month_key: string
  month_label: string
  income_cash: number
  expenses_cash: number
  gross_cash: number
  base_income: number
  base_expenses: number
  iva_repercutido: number
  iva_soportado: number
  fiscal_gross: number
  corporate_tax: number
  net_result: number
}

export interface FiscalPeriodSummary {
  period_label: string
  income_cash: number
  expenses_cash: number
  gross_cash: number
  has_iva_data: boolean
  base_income: number
  base_expenses: number
  iva_repercutido: number
  iva_soportado: number
  iva_liquidacion: number
  fiscal_gross: number
  corporate_tax_percent: number
  corporate_tax: number
  taxes_total: number
  net_result: number
  margin_cash_pct: number | null
  margin_net_pct: number | null
  linked_incomes: number
  incomes_with_iva: number
  expenses_with_iva: number
  monthly: FiscalMonthlyRow[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizeText(text: string | null): string {
  return (text || '').toUpperCase().trim().replace(/\s+/g, ' ')
}

function monthLabelFromKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${MONTH_LABELS[m - 1]} ${String(y).slice(2)}`
}

interface BankRow {
  id: string
  date: string
  amount: number
  description: string
}

interface LinkedInvoice {
  bank_transaction_id: string
  subtotal: number
  iva: number
}

interface MatchedExpense {
  bankId: string
  date: string
  base: number
  iva: number
}

async function loadBankRows(startStr: string, endStr: string): Promise<BankRow[]> {
  const result = await query<{
    id: string
    date: Date | string
    amount: number
    description: string
  }>(
    `SELECT id, date, amount, description
     FROM bank_transactions
     WHERE date >= $1 AND date <= $2
     ORDER BY date`,
    [startStr, endStr]
  )
  return result.rows.map((r) => ({
    id: r.id,
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
    amount: Number(r.amount),
    description: r.description || '',
  }))
}

async function loadLinkedInvoices(): Promise<Map<string, LinkedInvoice>> {
  const map = new Map<string, LinkedInvoice>()
  try {
    const result = await query<{
      bank_transaction_id: string
      subtotal: number
      iva: number
    }>(
      `SELECT bank_transaction_id, subtotal, iva
       FROM invoices
       WHERE deleted_at IS NULL AND bank_transaction_id IS NOT NULL`
    )
    result.rows.forEach((inv) => {
      if (inv.bank_transaction_id) {
        map.set(inv.bank_transaction_id, {
          bank_transaction_id: inv.bank_transaction_id,
          subtotal: Number(inv.subtotal),
          iva: Number(inv.iva),
        })
      }
    })
  } catch {
    // invoices table
  }
  return map
}

async function matchExpensesWithIva(
  startDate: Date,
  endDate: Date,
  bankExpenseRows: BankRow[]
): Promise<MatchedExpense[]> {
  const matched: MatchedExpense[] = []
  try {
    const manualExpenses = await prisma.expense.findMany({
      where: {
        deleted_at: null,
        OR: [
          { date_start: { gte: startDate, lte: endDate } },
          { date_end: { gte: startDate, lte: endDate } },
          { AND: [{ date_start: { lte: startDate } }, { date_end: { gte: endDate } }] },
        ],
      },
      select: {
        name: true,
        date_start: true,
        date_end: true,
        base_amount: true,
        iva_amount: true,
        total_amount: true,
        notes: true,
      },
    })

    const manualNorm = manualExpenses.map((m) => ({
      nameNorm: normalizeText(m.name),
      base: Number(m.base_amount),
      iva: Number(m.iva_amount),
      total: Number(m.total_amount),
      start: m.date_start,
      end: m.date_end,
      bankTransactionId: m.notes?.trim() || null,
    }))

    for (const row of bankExpenseRows) {
      const descNorm = normalizeText(row.description)
      const expenseDate = new Date(row.date)
      const absAmount = Math.abs(row.amount)
      const hit = manualNorm.find((m) => {
        if (m.bankTransactionId && m.bankTransactionId === row.id) return true
        const sameConcept = m.nameNorm === descNorm
        const inRange = expenseDate >= m.start && expenseDate <= m.end
        const sameAmount = Math.abs(m.total - absAmount) < 0.02
        return sameConcept && inRange && sameAmount
      })
      if (hit && hit.iva > 0) {
        matched.push({
          bankId: row.id,
          date: row.date,
          base: hit.base,
          iva: hit.iva,
        })
      }
    }
  } catch {
    // expenses table
  }
  return matched
}

async function getCorporateTaxPercent(): Promise<number> {
  try {
    const settings = await prisma.financialSettings.findUnique({ where: { id: 1 } })
    return settings ? Number(settings.corporate_tax_percent) : 25
  } catch {
    return 25
  }
}

function aggregateMonth(
  monthKey: string,
  incomes: BankRow[],
  expenses: BankRow[],
  linked: Map<string, LinkedInvoice>,
  expenseMatches: Map<string, MatchedExpense>,
  corporateTaxPercent: number,
  hasIvaGlobally: boolean
): FiscalMonthlyRow {
  const inc = incomes.filter((r) => r.date.slice(0, 7) === monthKey)
  const exp = expenses.filter((r) => r.date.slice(0, 7) === monthKey)

  const income_cash = round2(inc.reduce((s, r) => s + r.amount, 0))
  const expenses_cash = round2(exp.reduce((s, r) => s + Math.abs(r.amount), 0))
  const gross_cash = round2(income_cash - expenses_cash)

  let base_income = 0
  let iva_repercutido = 0
  let base_expenses = 0
  let iva_soportado = 0

  for (const row of inc) {
    const inv = linked.get(row.id)
    if (inv && inv.iva > 0) {
      base_income += inv.subtotal
      iva_repercutido += inv.iva
    } else {
      base_income += row.amount
    }
  }

  for (const row of exp) {
    const m = expenseMatches.get(row.id)
    if (m) {
      base_expenses += m.base
      iva_soportado += m.iva
    } else {
      base_expenses += Math.abs(row.amount)
    }
  }

  base_income = round2(base_income)
  base_expenses = round2(base_expenses)
  iva_repercutido = round2(iva_repercutido)
  iva_soportado = round2(iva_soportado)

  const fiscal_gross = hasIvaGlobally ? round2(base_income - base_expenses) : gross_cash

  const corporate_tax =
    fiscal_gross > 0 ? round2((fiscal_gross * corporateTaxPercent) / 100) : 0
  const iva_liquidacion = hasIvaGlobally ? round2(iva_repercutido - iva_soportado) : 0
  const taxes = hasIvaGlobally
    ? round2(Math.max(0, iva_liquidacion) + corporate_tax)
    : corporate_tax
  const net_result = round2(fiscal_gross - taxes)

  return {
    month_key: monthKey,
    month_label: monthLabelFromKey(monthKey),
    income_cash,
    expenses_cash,
    gross_cash,
    base_income,
    base_expenses,
    iva_repercutido,
    iva_soportado,
    fiscal_gross,
    corporate_tax,
    net_result,
  }
}

export async function buildFiscalPeriodSummary(
  startDate: Date,
  endDate: Date
): Promise<FiscalPeriodSummary> {
  const startStr = format(startDate, 'yyyy-MM-dd')
  const endStr = format(endDate, 'yyyy-MM-dd')
  const period_label = `${format(startDate, 'd MMM yyyy', { locale: es })} – ${format(endDate, 'd MMM yyyy', { locale: es })}`

  const allRows = await loadBankRows(startStr, endStr)
  const incomeRows = allRows.filter((r) => r.amount > 0)
  const expenseRows = allRows.filter((r) => r.amount < 0)

  const income_cash = round2(incomeRows.reduce((s, r) => s + r.amount, 0))
  const expenses_cash = round2(expenseRows.reduce((s, r) => s + Math.abs(r.amount), 0))
  const gross_cash = round2(income_cash - expenses_cash)

  const linked = await loadLinkedInvoices()
  const expenseMatchesList = await matchExpensesWithIva(startDate, endDate, expenseRows)
  const expenseMatches = new Map(expenseMatchesList.map((m) => [m.bankId, m]))

  let base_income = 0
  let iva_repercutido = 0
  let linked_incomes = 0
  let incomes_with_iva = 0

  // Base imponible: factura vinculada con IVA → subtotal; si no, el cobro bancario íntegro
  for (const row of incomeRows) {
    const inv = linked.get(row.id)
    if (inv) {
      linked_incomes++
      if (inv.iva > 0) {
        incomes_with_iva++
        base_income += inv.subtotal
        iva_repercutido += inv.iva
      } else {
        base_income += row.amount
      }
    } else {
      base_income += row.amount
    }
  }

  let base_expenses = 0
  let iva_soportado = 0
  const matchedExpenseIds = new Set(expenseMatchesList.map((m) => m.bankId))
  for (const m of expenseMatchesList) {
    base_expenses += m.base
    iva_soportado += m.iva
  }
  // Gastos sin match IVA: cuentan el importe bancario (evita que fiscal ignore salidas reales)
  for (const row of expenseRows) {
    if (!matchedExpenseIds.has(row.id)) {
      base_expenses += Math.abs(row.amount)
    }
  }

  base_income = round2(base_income)
  base_expenses = round2(base_expenses)
  iva_repercutido = round2(iva_repercutido)
  iva_soportado = round2(iva_soportado)

  const has_iva_data = incomes_with_iva > 0 || iva_soportado > 0
  const iva_liquidacion = has_iva_data ? round2(iva_repercutido - iva_soportado) : 0
  // Con IVA: bases (factura + no vinculados). Sin IVA: bruto de caja = ingresos − gastos banco
  const fiscal_gross = has_iva_data ? round2(base_income - base_expenses) : gross_cash

  const corporate_tax_percent = await getCorporateTaxPercent()
  const corporate_tax =
    fiscal_gross > 0 ? round2((fiscal_gross * corporate_tax_percent) / 100) : 0

  const taxes_total = has_iva_data
    ? round2(Math.max(0, iva_liquidacion) + corporate_tax)
    : corporate_tax

  const net_result = round2(fiscal_gross - taxes_total)

  const months = eachMonthOfInterval({ start: startOfMonth(startDate), end: endOfMonth(endDate) })
  const monthly = months.map((m) =>
    aggregateMonth(
      format(m, 'yyyy-MM'),
      incomeRows,
      expenseRows,
      linked,
      expenseMatches,
      corporate_tax_percent,
      has_iva_data
    )
  )

  return {
    period_label,
    income_cash,
    expenses_cash,
    gross_cash,
    has_iva_data,
    base_income,
    base_expenses,
    iva_repercutido,
    iva_soportado,
    iva_liquidacion,
    fiscal_gross,
    corporate_tax_percent,
    corporate_tax,
    taxes_total,
    net_result,
    margin_cash_pct:
      income_cash > 0 ? round2((gross_cash / income_cash) * 1000) / 10 : null,
    margin_net_pct:
      income_cash > 0 ? round2((net_result / income_cash) * 1000) / 10 : null,
    linked_incomes,
    incomes_with_iva,
    expenses_with_iva: expenseMatchesList.length,
    monthly,
  }
}

export function fiscalToOverviewKpis(summary: FiscalPeriodSummary) {
  return {
    income: summary.income_cash,
    expenses: summary.expenses_cash,
    taxes: summary.taxes_total,
    net_result: summary.net_result,
    gross_cash: summary.gross_cash,
    has_iva_data: summary.has_iva_data,
  }
}
