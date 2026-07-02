import { getAccountTransactions, EnableBankingApiError } from './client'

type RawTx = {
  entry_reference?: string
  booking_date?: string
  value_date?: string
  transaction_date?: string
  transaction_amount?: { amount?: string }
  remittance_information?: string[]
}

export interface FetchAllTransactionsResult {
  transactions: unknown[]
  pages: number
  truncated: boolean
  passes: Array<{ name: string; count: number; pages: number; truncated?: boolean }>
  date_from: string
  date_to: string
}

function txDedupKey(tx: unknown): string {
  const t = tx as RawTx
  if (t.entry_reference) return `ref:${t.entry_reference}`
  const date = t.booking_date || t.value_date || t.transaction_date || ''
  const amt = t.transaction_amount?.amount ?? ''
  const desc = t.remittance_information?.[0] ?? ''
  return `k:${date}|${amt}|${desc}`
}

type PageParams = {
  strategy?: 'default' | 'longest'
  date_from?: string
  date_to?: string
}

async function paginateTransactions(
  accountUid: string,
  firstPageParams: PageParams,
  maxPages = 100
): Promise<{ transactions: unknown[]; pages: number; truncated: boolean }> {
  const out: unknown[] = []
  let continuationKey: string | undefined
  let pages = 0

  do {
    const page = (await getAccountTransactions(
      accountUid,
      continuationKey ? { continuation_key: continuationKey } : firstPageParams
    )) as { transactions?: unknown[]; continuation_key?: string | null }

    if (Array.isArray(page.transactions) && page.transactions.length > 0) {
      out.push(...page.transactions)
    }

    continuationKey =
      typeof page.continuation_key === 'string' && page.continuation_key
        ? page.continuation_key
        : undefined
    pages++
  } while (continuationKey && pages < maxPages)

  return {
    transactions: out,
    pages,
    truncated: Boolean(continuationKey && pages >= maxPages),
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Sync incremental: solo movimientos desde dateFrom (con margen ya aplicado) hasta hoy.
 */
export async function getIncrementalAccountTransactions(
  accountUid: string,
  dateFrom: string
): Promise<FetchAllTransactionsResult> {
  const today = isoDate(new Date())

  let transactions: unknown[] = []
  let pages = 0
  let truncated = false

  try {
    const r = await paginateTransactions(
      accountUid,
      { strategy: 'default', date_from: dateFrom, date_to: today },
      100
    )
    transactions = r.transactions
    pages = r.pages
    truncated = r.truncated
  } catch (err) {
    if (err instanceof EnableBankingApiError) {
      console.warn(`[enable-banking] incremental ${dateFrom}→${today} failed:`, err.message)
    } else {
      throw err
    }
  }

  const dates = (transactions as RawTx[])
    .map((t) => t.booking_date || t.value_date || t.transaction_date || '')
    .filter(Boolean)
    .sort()

  console.info(
    `[enable-banking] incremental sync ${dateFrom} → ${today}: ` +
      `${transactions.length} txs, ${pages} pages, truncated=${truncated}, ` +
      `api range ${dates[0] ?? '—'} → ${dates[dates.length - 1] ?? '—'}`
  )

  return {
    transactions,
    pages,
    truncated,
    date_from: dateFrom,
    date_to: today,
    passes: [
      {
        name: 'incremental',
        count: transactions.length,
        pages,
        truncated,
      },
    ],
  }
}

/** @deprecated usar getIncrementalAccountTransactions */
export async function getAllAccountTransactions(
  accountUid: string,
  options?: { sinceDate?: string | null }
): Promise<FetchAllTransactionsResult> {
  const from = options?.sinceDate
    ? isoDate(new Date(new Date(options.sinceDate).getTime() - 2 * 24 * 60 * 60 * 1000))
    : isoDate(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000))
  return getIncrementalAccountTransactions(accountUid, from)
}
