import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { query } from '@/lib/db'
import {
  extractOwnAccountIban,
  getAccountBalances,
  getAccountDetails,
  getAllAccountTransactions,
} from './client'
import {
  normalizeIban,
  parseEbTransactions,
  resignAmountsFromBalanceSeries,
} from './parse-transactions'
import { getLatestBankTestSession } from './session-store'

function normalizeDescription(description: string): string {
  return description.trim().toUpperCase().replace(/\s+/g, ' ')
}

function generateTransactionHash(
  accountId: string,
  date: string,
  amount: number,
  description: string,
  entryReference?: string
): string {
  const normalizedDesc = normalizeDescription(description)
  const ref = entryReference ? `|${entryReference}` : ''
  const data = `${accountId}|${date}|${amount.toFixed(2)}|${normalizedDesc}${ref}`
  return createHash('sha256').update(data).digest('hex')
}

async function getOrCreateEnableBankingAccount(
  accountUid: string,
  realIban?: string | null
): Promise<string> {
  const syntheticIban = `ENABLEBANKING:${accountUid}`
  const existing = await query<{ id: string }>(
    'SELECT id FROM bank_accounts WHERE iban = $1',
    [syntheticIban]
  )
  if (existing.rows[0]) {
    if (realIban) {
      await query(
        `UPDATE bank_accounts SET name = COALESCE(name, $2) WHERE id = $1`,
        [existing.rows[0].id, `CaixaBank ${realIban.slice(-4)}`]
      )
    }
    return existing.rows[0].id
  }

  const id = uuidv4()
  const label = realIban
    ? `CaixaBank ···${realIban.replace(/\s/g, '').slice(-4)}`
    : 'Cuenta Enable Banking'
  await query('INSERT INTO bank_accounts (id, name, iban) VALUES ($1, $2, $3)', [
    id,
    label,
    syntheticIban,
  ])
  return id
}

async function repairFromApiBatch(
  accountId: string,
  transactions: ReturnType<typeof parseEbTransactions>
): Promise<number> {
  let repaired = 0

  for (const tx of transactions) {
    const absAmt = Math.abs(tx.amount)

    // 1) Por entry_reference en descripción o fila única fecha+importe
    if (tx.entry_reference) {
      const byRef = await query(
        `UPDATE bank_transactions
         SET amount = $1, balance = COALESCE($2, balance)
         WHERE account_id = $3
           AND amount <> $1
           AND (
             description = $4
             OR date = $5 AND ABS(amount) = $6
           )
         RETURNING id`,
        [
          tx.amount,
          tx.balance,
          accountId,
          tx.description,
          tx.date,
          absAmt,
        ]
      )
      if (byRef.rowCount && byRef.rowCount > 0) {
        repaired += byRef.rowCount
        continue
      }
    }

    // 2) Corregir positivos que deberían ser gastos
    if (tx.amount < 0) {
      const fixDebit = await query(
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
      if (fixDebit.rowCount && fixDebit.rowCount > 0) {
        repaired += fixDebit.rowCount
        continue
      }
    }

    // 3) Cualquier fila con mismo día e importe absoluto pero signo distinto
    const fixSign = await query(
      `UPDATE bank_transactions
       SET amount = $1, balance = COALESCE($2, balance)
       WHERE account_id = $3 AND date = $4
         AND ABS(amount) = $5 AND amount <> $1
       RETURNING id`,
      [tx.amount, tx.balance, accountId, tx.date, absAmt]
    )
    if (fixSign.rowCount && fixSign.rowCount > 0) {
      repaired += fixSign.rowCount
    }
  }

  return repaired
}

async function repairFromStoredBalances(accountId: string): Promise<number> {
  const rows = await query<{
    id: string
    date: string
    amount: number
    balance: number | null
    created_at: string
  }>(
    `SELECT id, date, amount, balance, created_at
     FROM bank_transactions
     WHERE account_id = $1 AND balance IS NOT NULL
     ORDER BY date ASC, created_at ASC`,
    [accountId]
  )

  const updates = resignAmountsFromBalanceSeries(
    rows.rows.map((r) => ({
      id: r.id,
      date: String(r.date).slice(0, 10),
      amount: Number(r.amount),
      balance: r.balance !== null ? Number(r.balance) : null,
    }))
  )

  let repaired = 0
  for (const u of updates) {
    const result = await query(
      `UPDATE bank_transactions SET amount = $1 WHERE id = $2 AND amount <> $1 RETURNING id`,
      [u.amount, u.id]
    )
    if (result.rowCount && result.rowCount > 0) repaired++
  }

  return repaired
}

export async function syncEnableBankingTransactions(): Promise<{
  inserted: number
  updated: number
  duplicates: number
  total: number
  repaired: number
  balance_repaired: number
}> {
  const session = await getLatestBankTestSession()
  if (!session) {
    throw new Error('No hay conexión bancaria activa')
  }

  const accountUid = session.account_uid

  const [detailsRaw, balancesRaw, transactionsRaw] = await Promise.all([
    getAccountDetails(accountUid).catch(() => null),
    getAccountBalances(accountUid).catch(() => null),
    getAllAccountTransactions(accountUid),
  ])

  const ownIban = extractOwnAccountIban(detailsRaw)
  const accountId = await getOrCreateEnableBankingAccount(accountUid, ownIban)

  const transactions = parseEbTransactions(transactionsRaw, {
    ownAccountIban: ownIban,
    inferFromBalance: true,
  })

  if (transactions.length === 0) {
    const balanceRepaired = await repairFromStoredBalances(accountId)
    return {
      inserted: 0,
      updated: 0,
      duplicates: 0,
      total: 0,
      repaired: 0,
      balance_repaired: balanceRepaired,
    }
  }

  let inserted = 0
  let duplicates = 0

  let repaired = await repairFromApiBatch(accountId, transactions)
  const balanceRepaired = await repairFromStoredBalances(accountId)
  repaired += balanceRepaired

  const dates = transactions.map((t) => t.date).sort()
  const periodStart = dates[0]
  const periodEnd = dates[dates.length - 1]
  const statementId = uuidv4()
  const fileHash = createHash('sha256')
    .update(
      `${accountUid}:${periodStart}:${periodEnd}:${transactions.length}:v3:${normalizeIban(ownIban) || ''}`
    )
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
    const absAmt = Math.abs(tx.amount)
    const hash = generateTransactionHash(
      accountId,
      tx.date,
      tx.amount,
      tx.description,
      tx.entry_reference
    )

    const existing = await query<{ id: string; amount: number }>(
      `SELECT id, amount FROM bank_transactions
       WHERE account_id = $1 AND date = $2 AND ABS(amount) = $3
         AND (description = $4 OR description IS NOT DISTINCT FROM $4)
       ORDER BY ABS(amount - $5) ASC
       LIMIT 1`,
      [accountId, tx.date, absAmt, tx.description, tx.amount]
    )

    if (existing.rows[0]) {
      const row = existing.rows[0]
      if (Number(row.amount) !== tx.amount) {
        await query(
          `UPDATE bank_transactions
           SET amount = $1, balance = COALESCE($2, balance), hash = $3
           WHERE id = $4`,
          [tx.amount, tx.balance, hash, row.id]
        )
        repaired++
      } else {
        duplicates++
      }
      continue
    }

    const result = await query(
      `INSERT INTO bank_transactions
       (id, account_id, statement_id, date, amount, description, hash, balance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (account_id, hash) DO UPDATE SET
         amount = EXCLUDED.amount,
         balance = COALESCE(EXCLUDED.balance, bank_transactions.balance)`,
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

  return {
    inserted,
    updated: 0,
    duplicates,
    total: transactions.length,
    repaired,
    balance_repaired: balanceRepaired,
  }
}
