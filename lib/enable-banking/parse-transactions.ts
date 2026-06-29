/**
 * Enable Banking / PSD2 (CaixaBank, etc.)
 *
 * - transaction_amount suele ir en valor absoluto (sin signo)
 * - credit_debit_indicator: CRDT = entrada (+), DBIT = salida (-)
 * - Si el indicador falla: comparar debtor/creditor_account.iban con la cuenta propia
 * - Último recurso: variación de balance_after_transaction entre movimientos consecutivos
 */

export interface ParsedEbTransaction {
  date: string
  amount: number
  description: string
  balance: number | null
  entry_reference?: string
  credit_debit_indicator?: string
  sign_source?: 'raw' | 'indicator' | 'iban' | 'balance' | 'counterparty' | 'default'
  /** Orden en la respuesta de la API (para inferencia de saldo) */
  api_index?: number
}

type RawTx = {
  booking_date?: string
  value_date?: string
  transaction_date?: string
  entry_reference?: string
  remittance_information?: string[]
  creditor?: { name?: string }
  debtor?: { name?: string }
  creditor_account?: { iban?: string }
  debtor_account?: { iban?: string }
  transaction_amount?: { amount?: string; currency?: string }
  balance_after_transaction?: { amount?: string }
  credit_debit_indicator?: string
  creditDebitIndicator?: string
  status?: string
}

export function normalizeIban(iban: string | undefined | null): string | null {
  if (!iban || typeof iban !== 'string') return null
  const n = iban.replace(/\s+/g, '').toUpperCase()
  return n.length >= 15 ? n : null
}

export function extractCreditDebitIndicator(tx: RawTx): string {
  const raw =
    tx.credit_debit_indicator ??
    tx.creditDebitIndicator ??
    (tx as Record<string, unknown>).credit_debit_indicator ??
    ''
  return String(raw).trim().toUpperCase()
}

function parseAbsAmount(amountRaw: string | undefined): number | null {
  if (!amountRaw) return null
  const n = parseFloat(amountRaw)
  if (!Number.isFinite(n) || n === 0) return null
  return Math.abs(n)
}

/** Signo explícito en el string del importe (algunos ASPSP lo envían) */
function signFromRawAmountString(amountRaw: string | undefined): number | null {
  if (!amountRaw) return null
  const trimmed = amountRaw.trim()
  if (!trimmed.startsWith('-')) return null
  const abs = parseAbsAmount(trimmed)
  return abs === null ? null : -abs
}

function signFromIndicator(indicator: string, abs: number): number | null {
  if (indicator === 'DBIT' || indicator === 'DEBIT' || indicator === 'D') return -abs
  if (indicator === 'CRDT' || indicator === 'CREDIT' || indicator === 'C') return abs
  return null
}

/** PSD2: si nuestra cuenta es debtor → sale dinero; si es creditor → entra */
function signFromOwnAccountIban(tx: RawTx, ownIban: string | null, abs: number): number | null {
  if (!ownIban) return null
  const own = normalizeIban(ownIban)
  if (!own) return null

  const debtor = normalizeIban(tx.debtor_account?.iban)
  const creditor = normalizeIban(tx.creditor_account?.iban)

  if (debtor && debtor === own) return -abs
  if (creditor && creditor === own) return abs
  return null
}

function signFromCounterparty(tx: RawTx, abs: number): number | null {
  const hasDebtor = Boolean(tx.debtor?.name?.trim())
  const hasCreditor = Boolean(tx.creditor?.name?.trim())
  if (hasDebtor && !hasCreditor) return -abs
  if (hasCreditor && !hasDebtor) return abs
  return null
}

export function signedAmountFromEb(tx: RawTx, ownAccountIban?: string | null): {
  amount: number
  sign_source: ParsedEbTransaction['sign_source']
} | null {
  const amountRaw = tx.transaction_amount?.amount
  if (!amountRaw) return null

  const fromRaw = signFromRawAmountString(amountRaw)
  if (fromRaw !== null) {
    return { amount: fromRaw, sign_source: 'raw' }
  }

  const abs = parseAbsAmount(amountRaw)
  if (abs === null) return null

  const indicator = extractCreditDebitIndicator(tx)
  const fromIndicator = signFromIndicator(indicator, abs)
  if (fromIndicator !== null) {
    return { amount: fromIndicator, sign_source: 'indicator' }
  }

  const fromIban = signFromOwnAccountIban(tx, ownAccountIban ?? null, abs)
  if (fromIban !== null) {
    return { amount: fromIban, sign_source: 'iban' }
  }

  const fromCounterparty = signFromCounterparty(tx, abs)
  if (fromCounterparty !== null) {
    return { amount: fromCounterparty, sign_source: 'counterparty' }
  }

  // Sin datos de dirección: asumir gasto si no hay indicador (conservador para PYMES)
  return { amount: -abs, sign_source: 'default' }
}

/** Corrige signos comparando balance_after_transaction entre movimientos ordenados */
export function applyBalanceSignInference(transactions: ParsedEbTransaction[]): ParsedEbTransaction[] {
  if (transactions.length < 2) return transactions

  const indexed = transactions.map((tx, index) => ({ tx, index }))
  const sorted = [...indexed].sort((a, b) => {
    const d = a.tx.date.localeCompare(b.tx.date)
    if (d !== 0) return d
    const ia = a.tx.api_index ?? a.index
    const ib = b.tx.api_index ?? b.index
    return ia - ib
  })

  const result = transactions.map((t) => ({ ...t }))

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].tx
    const curr = sorted[i].tx
    if (prev.balance == null || curr.balance == null) continue

    const abs = Math.abs(curr.amount)
    if (abs === 0) continue

    const delta = curr.balance - prev.balance
    const tol = 0.02

    let inferred: number | null = null
    if (Math.abs(delta - abs) < tol) inferred = abs
    else if (Math.abs(delta + abs) < tol) inferred = -abs

    if (inferred === null) continue

    const idx = sorted[i].index
    if (result[idx].amount !== inferred) {
      result[idx] = { ...result[idx], amount: inferred, sign_source: 'balance' }
    }
  }

  return result
}

function extractTransactionList(raw: unknown): RawTx[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  if (Array.isArray(o.transactions)) return o.transactions as RawTx[]
  return []
}

export function parseEbTransactions(
  raw: unknown,
  options?: { ownAccountIban?: string | null; inferFromBalance?: boolean }
): ParsedEbTransaction[] {
  const list = extractTransactionList(raw)
  const ownIban = options?.ownAccountIban ?? null
  const inferFromBalance = options?.inferFromBalance !== false

  const out: ParsedEbTransaction[] = []

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    const tx = item as RawTx
    if (tx.status && tx.status.toUpperCase() === 'PDNG') continue

    const dateRaw = tx.booking_date || tx.value_date || tx.transaction_date
    if (!dateRaw) continue

    const signed = signedAmountFromEb(tx, ownIban)
    if (!signed) continue

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
      amount: signed.amount,
      description,
      balance,
      entry_reference: tx.entry_reference,
      credit_debit_indicator: extractCreditDebitIndicator(tx) || undefined,
      sign_source: signed.sign_source,
      api_index: i,
    })
  }

  if (inferFromBalance && out.length >= 2) {
    return applyBalanceSignInference(out)
  }

  return out
}

/** Repara signos en filas ya guardadas usando la columna balance */
export function resignAmountsFromBalanceSeries<
  T extends { id: string; date: string; amount: number; balance: number | null },
>(rows: T[]): Array<{ id: string; amount: number }> {
  if (rows.length < 2) return []

  const sorted = [...rows].sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date))
    if (d !== 0) return d
    return (a.balance ?? 0) - (b.balance ?? 0)
  })

  const updates: Array<{ id: string; amount: number }> = []

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (prev.balance == null || curr.balance == null) continue

    const abs = Math.abs(Number(curr.amount))
    if (abs === 0) continue

    const delta = Number(curr.balance) - Number(prev.balance)
    const tol = 0.02

    let correct: number | null = null
    if (Math.abs(delta - abs) < tol) correct = abs
    else if (Math.abs(delta + abs) < tol) correct = -abs

    if (correct !== null && Math.abs(Number(curr.amount) - correct) > tol) {
      updates.push({ id: curr.id, amount: correct })
    }
  }

  return updates
}
