import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { query } from '@/lib/db'
import { getAccountBalances, getAccountTransactions } from './client'
import { parseEbTransactions } from './parse-transactions'
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

export async function syncEnableBankingTransactions(): Promise<{
  inserted: number
  updated: number
  duplicates: number
  total: number
  repaired: number
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
    return { inserted: 0, updated: 0, duplicates: 0, total: 0, repaired: 0 }
  }

  let inserted = 0
  let updated = 0
  let duplicates = 0
  let repaired = 0

  // Corregir movimientos guardados con signo erróneo (importe siempre positivo)
  for (const tx of transactions) {
    const absAmt = Math.abs(tx.amount)

    // Gastos mal guardados como positivos (caso habitual Enable Banking)
    if (tx.amount < 0) {
      const fixResult = await query(
        `UPDATE bank_transactions
         SET amount = $1, balance = COALESCE($2, balance)
         WHERE id = (
           SELECT id FROM bank_transactions
           WHERE account_id = $3 AND date = $4
             AND ABS(amount) = $5 AND amount > 0
           ORDER BY created_at ASC
           LIMIT 1
         )
         RETURNING id`,
        [tx.amount, tx.balance, accountId, tx.date, absAmt]
      )
      if (fixResult.rowCount && fixResult.rowCount > 0) {
        repaired += fixResult.rowCount
        continue
      }
    }

    const fixResult2 = await query(
      `UPDATE bank_transactions
       SET amount = $1, balance = COALESCE($2, balance)
       WHERE account_id = $3 AND date = $4
         AND ABS(amount) = $5
         AND amount <> $1
         AND description = $6
       RETURNING id`,
      [tx.amount, tx.balance, accountId, tx.date, absAmt, tx.description]
    )
    if (fixResult2.rowCount && fixResult2.rowCount > 0) {
      updated += fixResult2.rowCount
    }
  }

  const dates = transactions.map((t) => t.date).sort()
  const periodStart = dates[0]
  const periodEnd = dates[dates.length - 1]
  const statementId = uuidv4()
  const fileHash = createHash('sha256')
    .update(`${accountUid}:${periodStart}:${periodEnd}:${transactions.length}:v2`)
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

  for (const tx of transactions) {
    const hash = generateTransactionHash(accountId, tx.date, tx.amount, tx.description)
    const existing = await query<{ id: string }>(
      `SELECT id FROM bank_transactions
       WHERE account_id = $1 AND date = $2 AND ABS(amount) = $3 AND description = $4
       LIMIT 1`,
      [accountId, tx.date, Math.abs(tx.amount), tx.description]
    )
    if (existing.rows[0]) {
      duplicates++
      continue
    }

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

  return { inserted, updated, duplicates, total: transactions.length, repaired }
}
