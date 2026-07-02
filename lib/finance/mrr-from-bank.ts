import { query } from '@/lib/db'
import { FINANCE_BANK_MIN_DATE } from './period-presets'

export interface BankMrrClient {
  name: string
  amount: number
}

export interface BankMrrResult {
  mrr: number
  active_clients: number
  by_client: BankMrrClient[]
}

type BankInflowRow = {
  amount: string | number
  date: string
  description: string | null
  client_name: string | null
}

/** Normaliza descripción bancaria para agrupar por cliente */
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

/**
 * MRR estimado solo desde movimientos bancarios:
 * ingresos recurrentes = clientes con cobros en 2+ meses distintos (últimos 3 meses).
 */
export async function computeBankMrr(): Promise<BankMrrResult> {
  const now = new Date()
  const lookbackStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const minDate = new Date(FINANCE_BANK_MIN_DATE)
  const startDate = lookbackStart < minDate ? minDate : lookbackStart
  const startStr = startDate.toISOString().slice(0, 10)

  let rows: BankInflowRow[] = []
  try {
    const result = await query<BankInflowRow>(
      `SELECT bt.amount, bt.date::text AS date, bt.description,
              i.client_name
       FROM bank_transactions bt
       LEFT JOIN invoices i ON i.bank_transaction_id = bt.id AND i.deleted_at IS NULL
       WHERE bt.date >= $1 AND bt.amount > 0
       ORDER BY bt.date`,
      [startStr]
    )
    rows = result.rows
  } catch {
    return { mrr: 0, active_clients: 0, by_client: [] }
  }

  if (rows.length === 0) {
    return { mrr: 0, active_clients: 0, by_client: [] }
  }

  const byClientMonth = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const name =
      row.client_name?.trim() ||
      clientKeyFromDescription(row.description || 'Sin identificar')
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
      Math.round((monthlyTotals.reduce((s: number, v: number) => s + v, 0) / monthlyTotals.length) * 100) /
      100
    if (avg <= 0) continue
    by_client.push({ name, amount: avg })
  }

  by_client.sort((a, b) => b.amount - a.amount)

  const mrr = Math.round(by_client.reduce((s, c) => s + c.amount, 0) * 100) / 100

  return {
    mrr,
    active_clients: by_client.length,
    by_client: by_client.slice(0, 12),
  }
}

export async function loadMrrByClientFromBank(): Promise<BankMrrClient[]> {
  const { by_client } = await computeBankMrr()
  return by_client
}
