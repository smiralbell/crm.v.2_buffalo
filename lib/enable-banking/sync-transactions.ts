import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { query } from '@/lib/db'
import {
  extractOwnAccountIban,
  getAccountBalances,
  getAccountDetails,
  getFullAccountTransactionsWithLogs,
  getIncrementalAccountTransactions,
  type EnableBankingApiLogEntry,
} from './client'
import {
  normalizeIban,
  parseEbTransactions,
  resignAmountsFromBalanceSeries,
} from './parse-transactions'
import { getLatestBankTestSession, updateBankLastSyncedAt } from './session-store'
import { fetchSampleMonthApiDebug, type BankApiDebugSample } from './sync-debug'
import { BANK_SYNC_MARGIN_DAYS, computeSyncFromDate } from './sync-window'

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

async function getDbDateRange(accountId: string): Promise<{
  oldest: string | null
  newest: string | null
}> {
  const row = await query<{ oldest: string | null; newest: string | null }>(
    `SELECT MIN(date)::text AS oldest, MAX(date)::text AS newest
     FROM bank_transactions WHERE account_id = $1`,
    [accountId]
  )
  return {
    oldest: row.rows[0]?.oldest ?? null,
    newest: row.rows[0]?.newest ?? null,
  }
}

async function repairFromApiBatch(
  accountId: string,
  transactions: ReturnType<typeof parseEbTransactions>
): Promise<number> {
  let repaired = 0

  for (const tx of transactions) {
    const absAmt = Math.abs(tx.amount)

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
        [tx.amount, tx.balance, accountId, tx.description, tx.date, absAmt]
      )
      if (byRef.rowCount && byRef.rowCount > 0) {
        repaired += byRef.rowCount
        continue
      }
    }

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

async function syncOneAccount(
  accountUid: string,
  options: {
    mode: 'incremental' | 'full'
    syncFrom: string
    apiDebugSample: BankApiDebugSample | null
  }
): Promise<{
  inserted: number
  duplicates: number
  total: number
  repaired: number
  balance_repaired: number
  api_oldest: string | null
  api_newest: string | null
  db_oldest: string | null
  db_newest: string | null
  pages_fetched: number
  truncated: boolean
  passes: Array<{ name: string; count: number; pages: number }>
  api_debug_sample: BankApiDebugSample | null
  incremental_api_error: string | null
  api_logs: EnableBankingApiLogEntry[]
}> {
  const accountId = await getOrCreateEnableBankingAccount(accountUid)

  const fetchResult =
    options.mode === 'full'
      ? await getFullAccountTransactionsWithLogs(accountUid)
      : await getIncrementalAccountTransactions(accountUid, options.syncFrom)

  const [detailsRaw, balancesRaw] = await Promise.all([
    getAccountDetails(accountUid).catch(() => null),
    getAccountBalances(accountUid).catch(() => null),
  ])

  const ownIban = extractOwnAccountIban(detailsRaw)
  if (ownIban) {
    await getOrCreateEnableBankingAccount(accountUid, ownIban)
  }

  const transactions = parseEbTransactions(
    { transactions: fetchResult.transactions },
    { ownAccountIban: ownIban, inferFromBalance: true }
  )

  if (transactions.length === 0) {
    const balanceRepaired = await repairFromStoredBalances(accountId)
    const dbAfter = await getDbDateRange(accountId)
    return {
      inserted: 0,
      duplicates: 0,
      total: 0,
      repaired: 0,
      balance_repaired: balanceRepaired,
      api_oldest: null,
      api_newest: null,
      db_oldest: dbAfter.oldest,
      db_newest: dbAfter.newest,
      pages_fetched: fetchResult.pages,
      truncated: fetchResult.truncated,
      passes: fetchResult.passes,
      api_debug_sample: options.apiDebugSample,
      incremental_api_error: fetchResult.api_error ?? null,
      api_logs: fetchResult.api_logs ?? [],
    }
  }

  const sortedDates = transactions.map((t) => t.date).sort()
  const apiOldest = sortedDates[0] ?? null
  const apiNewest = sortedDates[sortedDates.length - 1] ?? null

  let inserted = 0
  let duplicates = 0

  let repaired = await repairFromApiBatch(accountId, transactions)
  const balanceRepaired = await repairFromStoredBalances(accountId)
  repaired += balanceRepaired

  const periodStart = sortedDates[0]
  const periodEnd = sortedDates[sortedDates.length - 1]
  const statementId = uuidv4()
  const fileHash = createHash('sha256')
    .update(
      `${accountUid}:${periodStart}:${periodEnd}:${transactions.length}:v4:${normalizeIban(ownIban) || ''}`
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
    const hash = generateTransactionHash(
      accountId,
      tx.date,
      tx.amount,
      tx.description,
      tx.entry_reference
    )

    const existing = await query<{ id: string; amount: number }>(
      `SELECT id, amount FROM bank_transactions
       WHERE account_id = $1 AND hash = $2
       LIMIT 1`,
      [accountId, hash]
    )

    if (existing.rows[0]) {
      const row = existing.rows[0]
      if (Number(row.amount) !== tx.amount) {
        await query(
          `UPDATE bank_transactions
           SET amount = $1, balance = COALESCE($2, balance)
           WHERE id = $3`,
          [tx.amount, tx.balance, row.id]
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

  const dbAfter = await getDbDateRange(accountId)

  return {
    inserted,
    duplicates,
    total: transactions.length,
    repaired,
    balance_repaired: balanceRepaired,
    api_oldest: apiOldest,
    api_newest: apiNewest,
    db_oldest: dbAfter.oldest,
    db_newest: dbAfter.newest,
    pages_fetched: fetchResult.pages,
    truncated: fetchResult.truncated,
    passes: fetchResult.passes,
    api_debug_sample: options.apiDebugSample,
    incremental_api_error: fetchResult.api_error ?? null,
    api_logs: fetchResult.api_logs ?? [],
  }
}

function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

export async function syncEnableBankingTransactions(options?: {
  mode?: 'incremental' | 'full'
}): Promise<{
  inserted: number
  updated: number
  duplicates: number
  total: number
  repaired: number
  balance_repaired: number
  oldest_date: string | null
  newest_date: string | null
  api_oldest: string | null
  api_newest: string | null
  db_oldest: string | null
  db_newest: string | null
  pages_fetched: number
  truncated: boolean
  accounts_synced: number
  passes: Array<{ name: string; count: number; pages: number }>
  sync_from: string
  sync_to: string
  last_synced_at_before: string | null
  last_synced_at_after: string
  margin_days: number
  anchor_source: 'last_sync' | 'session_created'
  api_debug_sample: BankApiDebugSample | null
  api_debug_error: string | null
  incremental_api_error: string | null
  api_logs: EnableBankingApiLogEntry[]
  sync_mode: 'incremental' | 'full'
}> {
  const mode = options?.mode ?? 'incremental'
  const session = await getLatestBankTestSession()
  if (!session) {
    throw new Error('No hay conexión bancaria activa')
  }

  const window = computeSyncFromDate(session.last_synced_at, session.created_at)
  const syncFrom = mode === 'full' ? '2025-01-01' : window.from
  const lastSyncedBefore = session.last_synced_at?.toISOString() ?? null

  let apiDebugSample: BankApiDebugSample | null = null
  let apiDebugError: string | null = null
  if (mode === 'incremental') {
    try {
      apiDebugSample = await fetchSampleMonthApiDebug(session.account_uid)
      if (apiDebugSample.error) {
        apiDebugError = apiDebugSample.error
        console.warn('[enable-banking] sample month debug error:', apiDebugSample.error)
      } else {
        console.info(
          '[enable-banking] sample month debug',
          JSON.stringify(
            {
              month: apiDebugSample.month_label,
              keys: apiDebugSample.first_page.top_level_keys,
              tx_count: apiDebugSample.first_page.transaction_count,
              tx_fields: apiDebugSample.sample_transaction_keys,
              preview: apiDebugSample.all_transactions_preview,
            },
            null,
            2
          )
        )
      }
    } catch (err) {
      apiDebugError = err instanceof Error ? err.message : 'Error desconocido'
      console.warn('[enable-banking] sample month debug failed:', err)
    }
  }

  const accountUids = session.account_uids.length > 0 ? session.account_uids : [session.account_uid]

  let inserted = 0
  let duplicates = 0
  let total = 0
  let repaired = 0
  let balanceRepaired = 0
  let apiOldest: string | null = null
  let apiNewest: string | null = null
  let dbOldest: string | null = null
  let dbNewest: string | null = null
  let pagesFetched = 0
  let truncated = false
  let incrementalApiError: string | null = null
  const allApiLogs: EnableBankingApiLogEntry[] = []
  const allPasses: Array<{ name: string; count: number; pages: number }> = []

  for (const uid of accountUids) {
    const r = await syncOneAccount(uid, {
      mode,
      syncFrom,
      apiDebugSample: uid === session.account_uid ? apiDebugSample : null,
    })
    inserted += r.inserted
    duplicates += r.duplicates
    total += r.total
    repaired += r.repaired
    balanceRepaired += r.balance_repaired
    apiOldest = minDate(apiOldest, r.api_oldest)
    apiNewest = maxDate(apiNewest, r.api_newest)
    dbOldest = minDate(dbOldest, r.db_oldest)
    dbNewest = maxDate(dbNewest, r.db_newest)
    pagesFetched += r.pages_fetched
    truncated = truncated || r.truncated
    if (r.incremental_api_error) incrementalApiError = r.incremental_api_error
    if (r.api_logs.length > 0) allApiLogs.push(...r.api_logs)
    for (const p of r.passes) {
      const existing = allPasses.find((x) => x.name === p.name)
      if (existing) {
        existing.count += p.count
        existing.pages += p.pages
      } else {
        allPasses.push({ ...p })
      }
    }
  }

  const syncedAt = new Date()
  await updateBankLastSyncedAt(session.id, syncedAt)

  return {
    inserted,
    updated: 0,
    duplicates,
    total,
    repaired,
    balance_repaired: balanceRepaired,
    oldest_date: apiOldest,
    newest_date: apiNewest,
    api_oldest: apiOldest,
    api_newest: apiNewest,
    db_oldest: dbOldest,
    db_newest: dbNewest,
    pages_fetched: pagesFetched,
    truncated,
    accounts_synced: accountUids.length,
    passes: allPasses,
    sync_from: syncFrom,
    sync_to: new Date().toISOString().slice(0, 10),
    last_synced_at_before: lastSyncedBefore,
    last_synced_at_after: syncedAt.toISOString(),
    margin_days: BANK_SYNC_MARGIN_DAYS,
    anchor_source: mode === 'full' ? 'session_created' : window.anchor_source,
    api_debug_sample: apiDebugSample,
    api_debug_error: apiDebugError,
    incremental_api_error: incrementalApiError,
    api_logs: allApiLogs,
    sync_mode: mode,
  }
}
