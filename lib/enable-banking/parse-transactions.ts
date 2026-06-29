/**
 * Enable Banking devuelve transaction_amount siempre en valor absoluto.
 * credit_debit_indicator: CRDT = entrada (+), DBIT = salida (-)
 */

export interface ParsedEbTransaction {
  date: string
  amount: number
  description: string
  balance: number | null
  entry_reference?: string
  credit_debit_indicator?: string
}

type RawTx = {
  booking_date?: string
  value_date?: string
  entry_reference?: string
  remittance_information?: string[]
  creditor?: { name?: string }
  debtor?: { name?: string }
  transaction_amount?: { amount?: string; currency?: string }
  balance_after_transaction?: { amount?: string }
  credit_debit_indicator?: string
  creditDebitIndicator?: string
}

export function signedAmountFromEb(tx: RawTx): number | null {
  const amountRaw = tx.transaction_amount?.amount
  if (!amountRaw) return null
  const abs = Math.abs(parseFloat(amountRaw))
  if (!Number.isFinite(abs) || abs === 0) return null

  const indicator = (tx.credit_debit_indicator ?? tx.creditDebitIndicator ?? '').toUpperCase()
  if (indicator === 'DBIT' || indicator === 'DEBIT') return -abs
  if (indicator === 'CRDT' || indicator === 'CREDIT') return abs

  // Sin indicador: heurística PSD2 — si hay debtor suele ser cargo en cuenta
  if (tx.debtor?.name && !tx.creditor?.name) return -abs
  if (tx.creditor?.name && !tx.debtor?.name) return abs

  return null
}

export function parseEbTransactions(raw: unknown): ParsedEbTransaction[] {
  if (!raw || typeof raw !== 'object') return []
  const list = (raw as { transactions?: unknown[] }).transactions
  if (!Array.isArray(list)) return []

  const out: ParsedEbTransaction[] = []

  for (const item of list) {
    const tx = item as RawTx
    const dateRaw = tx.booking_date || tx.value_date
    if (!dateRaw) continue

    const amount = signedAmountFromEb(tx)
    if (amount === null) continue

    const parts = [
      ...(tx.remittance_information || []),
      tx.creditor?.name,
      tx.debtor?.name,
    ].filter(Boolean)
    const description = (parts[0] || 'Movimiento').trim()

    let balance: number | null = null
    if (tx.balance_after_transaction?.amount) {
      const b = parseFloat(tx.balance_after_transaction.amount)
      if (Number.isFinite(b)) balance = b
    }

    out.push({
      date: dateRaw.slice(0, 10),
      amount,
      description,
      balance,
      entry_reference: tx.entry_reference,
      credit_debit_indicator: tx.credit_debit_indicator ?? tx.creditDebitIndicator,
    })
  }

  return out
}
