import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subYears } from 'date-fns'
import { es } from 'date-fns/locale'
import { query } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { isModelo303Settlement } from './payment-concepts'
import { quarterKeySettledBy303Payment, type IvaQuarterPoint } from './iva-quarters'

export type { IvaQuarterPoint } from './iva-quarters'
export { quarterKeySettledBy303Payment } from './iva-quarters'

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

export interface Modelo303Settlement {
  id: string
  date: string
  amount: number
  description: string
}

/** Movimiento que entra en el cálculo de IVA a deber */
export interface IvaMovement {
  id: string
  date: string
  kind: 'cobro' | 'gasto' | 'modelo_303'
  description: string
  /** + suma a lo que debes (IVA cobrado) · − resta (IVA gasto / 303) */
  iva: number
  base?: number
  ref?: string
}

export interface FiscalPeriodSummary {
  period_label: string
  income_cash: number
  expenses_cash: number
  gross_cash: number
  has_iva_data: boolean
  base_income: number
  base_expenses: number
  /** IVA del período filtrado (cobros vinculados) */
  iva_repercutido: number
  /** IVA del período filtrado (gastos CRM) */
  iva_soportado: number
  /** IVA liquidación del período = repercutido − soportado */
  iva_liquidacion: number
  /**
   * IVA a deber desde el último pago I.V.A. MODELO 303 (o desde el inicio del lookback).
   * Positivo = debes IVA a Hacienda. Negativo = a compensar / te favorecen.
   */
  iva_a_deber: number
  iva_since_settlement_repercutido: number
  iva_since_settlement_soportado: number
  last_modelo_303: Modelo303Settlement | null
  modelo_303_in_period: Modelo303Settlement[]
  /** Libro de movimientos IVA desde el último 303 (o lookback) */
  iva_movements: IvaMovement[]
  fiscal_gross: number
  corporate_tax_percent: number
  corporate_tax: number
  /** Estimación IS + IVA período (pantallas de resultado) */
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
  invoice_number: string
  client_name: string
}

interface MatchedExpense {
  bankId: string
  date: string
  base: number
  iva: number
}

interface CrmExpenseIva {
  id: number
  date: string
  base: number
  iva: number
  name: string
  bank_transaction_id: string | null
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
      invoice_number: string | null
      client_name: string | null
    }>(
      `SELECT bank_transaction_id, subtotal, iva, invoice_number, client_name
       FROM invoices
       WHERE deleted_at IS NULL AND bank_transaction_id IS NOT NULL`
    )
    result.rows.forEach((inv) => {
      if (inv.bank_transaction_id) {
        map.set(inv.bank_transaction_id, {
          bank_transaction_id: inv.bank_transaction_id,
          subtotal: Number(inv.subtotal),
          iva: Number(inv.iva),
          invoice_number: inv.invoice_number || '',
          client_name: inv.client_name || '',
        })
      }
    })
  } catch {
    // invoices table
  }
  return map
}

/**
 * IVA soportado = gastos que registráis en el CRM con iva_amount > 0.
 * Si notes = id de movimiento banco, usamos la fecha del banco.
 */
async function loadCrmExpensesWithIva(
  startDate: Date,
  endDate: Date,
  bankById: Map<string, BankRow>
): Promise<CrmExpenseIva[]> {
  try {
    const bankIds = Array.from(bankById.keys())
    const rows = await prisma.expense.findMany({
      where: {
        deleted_at: null,
        iva_amount: { gt: 0 },
        OR: [
          { date_start: { gte: startDate, lte: endDate } },
          { date_end: { gte: startDate, lte: endDate } },
          { AND: [{ date_start: { lte: startDate } }, { date_end: { gte: endDate } }] },
          ...(bankIds.length > 0 ? [{ notes: { in: bankIds } }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        date_start: true,
        base_amount: true,
        iva_amount: true,
        notes: true,
      },
      orderBy: { date_start: 'asc' },
    })

    const byId = new Map<number, CrmExpenseIva>()
    for (const r of rows) {
      if (isModelo303Settlement(r.name || '')) continue
      const bankId = r.notes?.trim() || null
      const bank = bankId ? bankById.get(bankId) : undefined
      byId.set(r.id, {
        id: r.id,
        date: bank?.date || format(r.date_start, 'yyyy-MM-dd'),
        base: Number(r.base_amount),
        iva: Number(r.iva_amount),
        name: r.name || '',
        bank_transaction_id: bankId,
      })
    }
    return Array.from(byId.values()).sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

/** Match banco ↔ gasto CRM (bases fiscales / gráficos mensuales) */
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
      if (isModelo303Settlement(row.description)) continue

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

function toSettlement(row: BankRow): Modelo303Settlement {
  return {
    id: row.id,
    date: row.date,
    amount: Math.abs(row.amount),
    description: row.description || 'I.V.A. MODELO 303',
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

  // Lookback amplio para encontrar el último modelo 303 y acumular IVA desde entonces
  const lookbackStart = subYears(startDate, 2)
  const lookbackStr = format(lookbackStart, 'yyyy-MM-dd')
  const lookbackRows = await loadBankRows(lookbackStr, endStr)

  const allRows = lookbackRows.filter((r) => r.date >= startStr && r.date <= endStr)
  const incomeRows = allRows.filter((r) => r.amount > 0)
  const expenseRows = allRows.filter((r) => r.amount < 0)

  const income_cash = round2(incomeRows.reduce((s, r) => s + r.amount, 0))
  const expenses_cash = round2(expenseRows.reduce((s, r) => s + Math.abs(r.amount), 0))
  const gross_cash = round2(income_cash - expenses_cash)

  const linked = await loadLinkedInvoices()

  const lookbackExpenses = lookbackRows.filter((r) => r.amount < 0)
  const bankById = new Map(lookbackRows.map((r) => [r.id, r]))
  const expenseMatchesList = await matchExpensesWithIva(lookbackStart, endDate, lookbackExpenses)
  const expenseMatches = new Map(expenseMatchesList.map((m) => [m.bankId, m]))

  // IVA de gastos = todos los gastos CRM con IVA (fecha banco si está enlazado)
  const crmExpensesWithIva = await loadCrmExpensesWithIva(lookbackStart, endDate, bankById)

  const settlementsAll = lookbackExpenses
    .filter((r) => isModelo303Settlement(r.description))
    .map(toSettlement)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  const last_modelo_303 =
    [...settlementsAll].reverse().find((s) => s.date <= endStr) ?? null

  const modelo_303_in_period = settlementsAll.filter(
    (s) => s.date >= startStr && s.date <= endStr
  )

  // Acumulado desde el día siguiente al último 303 (o desde lookback si no hay)
  const accrualStart = last_modelo_303
    ? (() => {
        const d = new Date(last_modelo_303.date + 'T12:00:00')
        d.setDate(d.getDate() + 1)
        return format(d, 'yyyy-MM-dd')
      })()
    : lookbackStr

  const accrualIncomes = lookbackRows.filter(
    (r) => r.amount > 0 && r.date >= accrualStart && r.date <= endStr
  )
  const accrualCrmExpenses = crmExpensesWithIva.filter(
    (e) => e.date >= accrualStart && e.date <= endStr
  )

  // IVA cobros = facturas vinculadas a lo cobrado en banco
  let iva_since_settlement_repercutido = 0
  for (const row of accrualIncomes) {
    const inv = linked.get(row.id)
    if (inv && inv.iva > 0) iva_since_settlement_repercutido += inv.iva
  }
  // IVA gastos = gastos CRM con IVA que habéis registrado
  let iva_since_settlement_soportado = 0
  for (const e of accrualCrmExpenses) {
    iva_since_settlement_soportado += e.iva
  }
  iva_since_settlement_repercutido = round2(iva_since_settlement_repercutido)
  iva_since_settlement_soportado = round2(iva_since_settlement_soportado)
  const iva_a_deber = round2(iva_since_settlement_repercutido - iva_since_settlement_soportado)

  // Libro de movimientos IVA (desde último 303)
  const iva_movements: IvaMovement[] = []
  if (last_modelo_303) {
    iva_movements.push({
      id: `303-${last_modelo_303.id}`,
      date: last_modelo_303.date,
      kind: 'modelo_303',
      description: last_modelo_303.description,
      iva: 0,
      ref: `Pago ${round2(last_modelo_303.amount)} € · contador a 0`,
    })
  }
  for (const row of accrualIncomes) {
    const inv = linked.get(row.id)
    if (!inv || inv.iva <= 0) continue
    iva_movements.push({
      id: `cobro-${row.id}`,
      date: row.date,
      kind: 'cobro',
      description:
        inv.client_name || inv.invoice_number
          ? `${inv.client_name || 'Cliente'}${inv.invoice_number ? ` · ${inv.invoice_number}` : ''}`
          : row.description || 'Cobro con factura',
      iva: round2(inv.iva),
      base: round2(inv.subtotal),
      ref: inv.invoice_number || undefined,
    })
  }
  for (const e of accrualCrmExpenses) {
    iva_movements.push({
      id: `gasto-${e.id}`,
      date: e.date,
      kind: 'gasto',
      description: e.name || 'Gasto con IVA',
      iva: -round2(e.iva),
      base: round2(e.base),
      ref: e.bank_transaction_id ? 'Vinculado a banco' : 'Gasto CRM',
    })
  }
  iva_movements.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  // —— Totales del período filtrado (para informes del rango) ——
  let base_income = 0
  let iva_repercutido = 0
  let linked_incomes = 0
  let incomes_with_iva = 0

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

  const periodCrmExpenses = crmExpensesWithIva.filter(
    (e) => e.date >= startStr && e.date <= endStr
  )
  // IVA soportado = gastos CRM con IVA (aunque no estén enlazados al banco)
  const iva_soportado = round2(periodCrmExpenses.reduce((s, e) => s + e.iva, 0))

  // Base gastos: match banco↔CRM si existe; si no, importe banco
  let base_expenses = 0
  const periodExpenseMatches = expenseMatchesList.filter(
    (m) => m.date >= startStr && m.date <= endStr
  )
  const matchedExpenseIds = new Set(periodExpenseMatches.map((m) => m.bankId))
  for (const m of periodExpenseMatches) {
    base_expenses += m.base
  }
  for (const row of expenseRows) {
    if (matchedExpenseIds.has(row.id) || isModelo303Settlement(row.description)) continue
    base_expenses += Math.abs(row.amount)
  }

  base_income = round2(base_income)
  base_expenses = round2(base_expenses)
  iva_repercutido = round2(iva_repercutido)

  const has_iva_data =
    incomes_with_iva > 0 ||
    periodCrmExpenses.length > 0 ||
    iva_since_settlement_repercutido > 0 ||
    iva_since_settlement_soportado > 0 ||
    last_modelo_303 != null

  const iva_liquidacion = has_iva_data ? round2(iva_repercutido - iva_soportado) : 0
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
    iva_a_deber,
    iva_since_settlement_repercutido,
    iva_since_settlement_soportado,
    last_modelo_303,
    modelo_303_in_period,
    iva_movements,
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
    expenses_with_iva: periodCrmExpenses.length,
    monthly,
  }
}

export function fiscalToOverviewKpis(summary: FiscalPeriodSummary) {
  return {
    income: summary.income_cash,
    expenses: summary.expenses_cash,
    /** Firma: + debes IVA · − te compensan / a favor */
    taxes: summary.iva_a_deber,
    taxes_owed: Math.max(0, summary.iva_a_deber),
    taxes_credit: Math.max(0, -summary.iva_a_deber),
    net_result: summary.net_result,
    gross_cash: summary.gross_cash,
    has_iva_data: summary.has_iva_data,
    last_modelo_303: summary.last_modelo_303,
  }
}

/**
 * IVA por trimestre alineado con los pagos I.V.A. MODELO 303.
 * Cada barra = trimestre liquidado; muestra cobrado/gastos/liquidación y el pago 303 correspondiente.
 */
export async function buildIvaByQuarter(quartersCount = 8): Promise<{
  quarters: IvaQuarterPoint[]
  total_iva_cobrado: number
  total_iva_gastos: number
  total_pagos_303: number
}> {
  const now = new Date()
  const currentQStart = startOfMonth(
    new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
  )
  // Un trimestre extra atrás para poder atribuir el 303 de enero (liquida T4 anterior)
  const oldest = new Date(
    currentQStart.getFullYear(),
    currentQStart.getMonth() - quartersCount * 3,
    1
  )
  const startStr = format(oldest, 'yyyy-MM-dd')
  const endStr = format(now, 'yyyy-MM-dd')

  const bankRows = await loadBankRows(startStr, endStr)
  const linked = await loadLinkedInvoices()
  const bankById = new Map(bankRows.map((r) => [r.id, r]))
  const crmExpenses = await loadCrmExpensesWithIva(oldest, now, bankById)

  const quarterKeys: string[] = []
  for (let i = quartersCount - 1; i >= 0; i--) {
    const d = new Date(currentQStart.getFullYear(), currentQStart.getMonth() - i * 3, 1)
    const y = d.getFullYear()
    const q = Math.floor(d.getMonth() / 3) + 1
    quarterKeys.push(`${y}-Q${q}`)
  }

  const byQ = new Map<string, IvaQuarterPoint>()
  for (const key of quarterKeys) {
    const [y, qPart] = key.split('-Q')
    byQ.set(key, {
      quarter_key: key,
      label: `T${qPart} ${y.slice(2)}`,
      iva_cobrado: 0,
      iva_gastos: 0,
      liquidacion: 0,
      pago_303: 0,
      pago_303_date: null,
      diferencia: 0,
      cobros_count: 0,
      gastos_count: 0,
    })
  }

  const toQuarterKey = (dateStr: string): string | null => {
    const [ys, ms] = dateStr.slice(0, 10).split('-')
    const y = Number(ys)
    const m = Number(ms)
    if (!y || !m) return null
    return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
  }

  for (const row of bankRows.filter((r) => r.amount > 0)) {
    const inv = linked.get(row.id)
    if (!inv || inv.iva <= 0) continue
    const key = toQuarterKey(row.date)
    if (!key || !byQ.has(key)) continue
    const q = byQ.get(key)!
    q.iva_cobrado += inv.iva
    q.cobros_count += 1
  }

  for (const e of crmExpenses) {
    const key = toQuarterKey(e.date)
    if (!key || !byQ.has(key)) continue
    const q = byQ.get(key)!
    q.iva_gastos += e.iva
    q.gastos_count += 1
  }

  // Pagos 303 → trimestre que liquidan (coinciden con el gráfico)
  for (const row of bankRows.filter((r) => r.amount < 0 && isModelo303Settlement(r.description))) {
    const key = quarterKeySettledBy303Payment(row.date)
    if (!key) continue
    if (!byQ.has(key)) continue
    const q = byQ.get(key)!
    q.pago_303 += Math.abs(row.amount)
    if (!q.pago_303_date || row.date >= q.pago_303_date) {
      q.pago_303_date = row.date
    }
  }

  const quarters = quarterKeys.map((key) => {
    const q = byQ.get(key)!
    const iva_cobrado = round2(q.iva_cobrado)
    const iva_gastos = round2(q.iva_gastos)
    const liquidacion = round2(iva_cobrado - iva_gastos)
    const pago_303 = round2(q.pago_303)
    return {
      ...q,
      iva_cobrado,
      iva_gastos,
      liquidacion,
      pago_303,
      diferencia: round2(liquidacion - pago_303),
    }
  })

  return {
    quarters,
    total_iva_cobrado: round2(quarters.reduce((s, q) => s + q.iva_cobrado, 0)),
    total_iva_gastos: round2(quarters.reduce((s, q) => s + q.iva_gastos, 0)),
    total_pagos_303: round2(quarters.reduce((s, q) => s + q.pago_303, 0)),
  }
}

