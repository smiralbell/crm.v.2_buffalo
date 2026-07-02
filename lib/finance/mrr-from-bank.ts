import { query } from '@/lib/db'
import { FINANCE_BANK_MIN_DATE } from './period-presets'

export interface BankMrrClient {
  name: string
  amount: number
  source: 'tagged' | 'detected'
}

export interface BankMrrResult {
  mrr: number
  active_clients: number
  by_client: BankMrrClient[]
  source: 'tagged' | 'detected' | 'mixed'
  tagged_count: number
}

type BankInflowRow = {
  amount: string | number
  date: string
  description: string | null
  client_name: string | null
  is_recurring_income: boolean | null
}

function clientKeyFromDescription(description: string): string {
  let d = description.trim()
  d = d.replace(
    /^(transferencia|transf\.?|abono|ingreso|recibo|pago|bizum|trf\.?)\s+(de|del|da|por|a favor de)?\s*/i,
    ''
  )
  d = d.replace(/\s+/g, ' ')
  d = d.split(/\s{2,}|\/| - |\*|\|/)[0]?.trim() ?? d
  if (d.length < 3) return 'Sin identificar'
  return d.slice(0, 80)
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function clientName(row: BankInflowRow): string {
  return (
    row.client_name?.trim() ||
    clientKeyFromDescription(row.description || 'Sin identificar')
  )
}

function computeFromRows(
  rows: BankInflowRow[],
  filter: (row: BankInflowRow) => boolean
): BankMrrClient[] {
  const byClientMonth = new Map<string, Map<string, number>>()

  for (const row of rows) {
    if (!filter(row)) continue
    const name = clientName(row)
    const mk = monthKey(row.date)
    const amount = Number(row.amount)
    if (!byClientMonth.has(name)) byClientMonth.set(name, new Map())
    const months = byClientMonth.get(name)!
    months.set(mk, (months.get(mk) ?? 0) + amount)
  }

  const by_client: BankMrrClient[] = []

  for (const [name, months] of Array.from(byClientMonth.entries())) {
    if (months.size < 1) continue
    const monthlyTotals = Array.from(months.values())
    const avg =
      Math.round((monthlyTotals.reduce((s, v) => s + v, 0) / monthlyTotals.length) * 100) / 100
    if (avg <= 0) continue
    by_client.push({ name, amount: avg, source: 'detected' })
  }

  return by_client.sort((a, b) => b.amount - a.amount)
}

/**
 * MRR desde banco:
 * 1) Ingresos marcados como mensualidad en Ingresos (prioridad)
 * 2) Si no hay etiquetas, heurística: 2+ meses con cobro del mismo cliente
 */
export async function computeBankMrr(): Promise<BankMrrResult> {
  const now = new Date()
  const lookbackStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const minDate = new Date(FINANCE_BANK_MIN_DATE)
  const startDate = lookbackStart < minDate ? minDate : lookbackStart
  const startStr = startDate.toISOString().slice(0, 10)

  let rows: BankInflowRow[] = []
  try {
    const result = await query<BankInflowRow>(
      `SELECT bt.amount, bt.date::text AS date, bt.description,
              i.client_name,
              COALESCE(bt.is_recurring_income, false) AS is_recurring_income
       FROM bank_transactions bt
       LEFT JOIN invoices i ON i.bank_transaction_id = bt.id AND i.deleted_at IS NULL
       WHERE bt.date >= $1 AND bt.amount > 0
       ORDER BY bt.date`,
      [startStr]
    )
    rows = result.rows
  } catch {
    try {
      const fallback = await query<BankInflowRow>(
        `SELECT bt.amount, bt.date::text AS date, bt.description,
                i.client_name,
                false AS is_recurring_income
         FROM bank_transactions bt
         LEFT JOIN invoices i ON i.bank_transaction_id = bt.id AND i.deleted_at IS NULL
         WHERE bt.date >= $1 AND bt.amount > 0
         ORDER BY bt.date`,
        [startStr]
      )
      rows = fallback.rows
    } catch {
      return { mrr: 0, active_clients: 0, by_client: [], source: 'detected', tagged_count: 0 }
    }
  }

  if (rows.length === 0) {
    return { mrr: 0, active_clients: 0, by_client: [], source: 'detected', tagged_count: 0 }
  }

  const taggedRows = rows.filter((r) => r.is_recurring_income)
  const taggedClients = computeFromRows(rows, (r) => Boolean(r.is_recurring_income)).map((c) => ({
    ...c,
    source: 'tagged' as const,
  }))

  if (taggedClients.length > 0) {
    const mrr = Math.round(taggedClients.reduce((s, c) => s + c.amount, 0) * 100) / 100
    return {
      mrr,
      active_clients: taggedClients.length,
      by_client: taggedClients.slice(0, 12),
      source: 'tagged',
      tagged_count: taggedRows.length,
    }
  }

  const byClientMonth = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const name = clientName(row)
    const mk = monthKey(row.date)
    const amount = Number(row.amount)
    if (!byClientMonth.has(name)) byClientMonth.set(name, new Map())
    const months = byClientMonth.get(name)!
    months.set(mk, (months.get(mk) ?? 0) + amount)
  }

  const by_client: BankMrrClient[] = []

  for (const [name, months] of Array.from(byClientMonth.entries())) {
    if (months.size < 2) continue
    const monthlyTotals = Array.from(months.values())
    const avg =
      Math.round((monthlyTotals.reduce((s, v) => s + v, 0) / monthlyTotals.length) * 100) / 100
    if (avg <= 0) continue
    by_client.push({ name, amount: avg, source: 'detected' })
  }

  by_client.sort((a, b) => b.amount - a.amount)
  const mrr = Math.round(by_client.reduce((s, c) => s + c.amount, 0) * 100) / 100

  return {
    mrr,
    active_clients: by_client.length,
    by_client: by_client.slice(0, 12),
    source: 'detected',
    tagged_count: 0,
  }
}

export async function loadMrrByClientFromBank(): Promise<BankMrrClient[]> {
  const { by_client } = await computeBankMrr()
  return by_client
}
