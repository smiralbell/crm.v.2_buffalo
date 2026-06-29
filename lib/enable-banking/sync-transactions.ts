import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { query } from '@/lib/db'
import { getAccountBalances, getAccountTransactions } from './client'
import { getLatestBankTestSession } from './session-store'

function normalizeDescription(description: string): string {
  return description.trim().toUpperCase().replace(/\s+/g, ' ')
}

function generateTransactionHash(
  accountId: string,
  date: string,
  amount: number,
  description: string
): string {
  const normalizedDesc = normalizeDescription(description)
  const data = `${accountId}|${date}|${amount.toFixed(2)}|${normalizedDesc}`
  return createHash('sha256').update(data).digest('hex')
}

async function getOrCreateEnableBankingAccount(accountUid: string): Promise<string> {
  const iban = `ENABLEBANKING:${accountUid}`
  const existing = await query<{ id: string }>(
    'SELECT id FROM bank_accounts WHERE iban = $1',
    [iban]
  )
  if (existing.rows[0]) return existing.rows[0].id

  const id = uuidv4()
  await query('INSERT INTO bank_accounts (id, name, iban) VALUES ($1, $2, $3)', [
    id,
    'Cuenta Enable Banking',
    iban,
  ])
  return id
}

function parseEbTransactions(raw: unknown): Array<{
  date: string
  amount: number
  description: string
  balance: number | null
}> {
  if (!raw || typeof raw !== 'object') return []
  const list = (raw as { transactions?: unknown[] }).transactions
  if (!Array.isArray(list)) return []

  const out: Array<{ date: string; amount: number; description: string; balance: number | null }> = []

  for (const item of list) {
    const tx = item as {
      booking_date?: string
      value_date?: string
      remittance_information?: string[]
      creditor?: { name?: string }
      debtor?: { name?: string }
      transaction_amount?: { amount?: string }
      balance_after_transaction?: { amount?: string }
    }

    const dateRaw = tx.booking_date || tx.value_date
    const amountRaw = tx.transaction_amount?.amount
    if (!dateRaw || !amountRaw) continue

    const amount = parseFloat(amountRaw)
    if (!Number.isFinite(amount) || amount === 0) continue

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

    out.push({ date: dateRaw.slice(0, 10), amount, description, balance })
  }

  return out
}

export async function syncEnableBankingTransactions(): Promise<{
  inserted: number
  duplicates: number
  total: number
}> {
  const session = await getLatestBankTestSession()
  if (!session) {
    throw new Error('No hay conexión bancaria activa')
  }

  const accountUid = session.account_uid
  const accountId = await getOrCreateEnableBankingAccount(accountUid)

  const [balancesRaw, transactionsRaw] = await Promise.all([
    getAccountBalances(accountUid).catch(() => null),
    getAccountTransactions(accountUid),
  ])

  const transactions = parseEbTransactions(transactionsRaw)
  if (transactions.length === 0) {
    return { inserted: 0, duplicates: 0, total: 0 }
  }

  const dates = transactions.map((t) => t.date).sort()
  const periodStart = dates[0]
  const periodEnd = dates[dates.length - 1]
  const statementId = uuidv4()
  const fileHash = createHash('sha256')
    .update(`${accountUid}:${periodStart}:${periodEnd}:${transactions.length}`)
    .digest('hex')

  await query(
    `INSERT INTO bank_statements
     (id, account_id, period_start, period_end, uploaded_at, file_hash, original_filename)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
    [
      statementId,
      accountId,
      periodStart,
      periodEnd,
      fileHash,
      `enable-banking-sync-${new Date().toISOString().slice(0, 10)}.json`,
    ]
  )

  let inserted = 0
  let duplicates = 0

  for (const tx of transactions) {
    const hash = generateTransactionHash(accountId, tx.date, tx.amount, tx.description)
    const result = await query(
      `INSERT INTO bank_transactions
       (id, account_id, statement_id, date, amount, description, hash, balance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (account_id, hash) DO NOTHING`,
      [uuidv4(), accountId, statementId, tx.date, tx.amount, tx.description, hash, tx.balance]
    )
    if (result.rowCount && result.rowCount > 0) inserted++
    else duplicates++
  }

  // Actualizar saldo en la última transacción si Enable Banking lo devolvió en balances
  if (balancesRaw && typeof balancesRaw === 'object') {
    const balances = (balancesRaw as { balances?: unknown[] }).balances
    const primary = Array.isArray(balances) ? balances[0] : null
    const amountStr = (primary as { balance_amount?: { amount?: string } })?.balance_amount?.amount
    if (amountStr) {
      const bal = parseFloat(amountStr)
      if (Number.isFinite(bal)) {
        await query(
          `UPDATE bank_transactions SET balance = $1
           WHERE id = (
             SELECT id FROM bank_transactions
             WHERE account_id = $2
             ORDER BY date DESC, created_at DESC
             LIMIT 1
           )`,
          [bal, accountId]
        )
      }
    }
  }

  return { inserted, duplicates, total: transactions.length }
}
