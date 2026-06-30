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
  passes: Array<{ name: string; count: number; pages: number }>
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
      continuationKey
        ? { continuation_key: continuationKey }
        : firstPageParams
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

async function safePaginate(
  accountUid: string,
  name: string,
  params: PageParams
): Promise<{ name: string; transactions: unknown[]; pages: number; truncated: boolean }> {
  try {
    const r = await paginateTransactions(accountUid, params)
    return { name, ...r }
  } catch (err) {
    if (err instanceof EnableBankingApiError) {
      console.warn(`[enable-banking] pass "${name}" failed:`, err.message)
      return { name, transactions: [], pages: 0, truncated: false }
    }
    throw err
  }
}

function mergeTransactions(batches: unknown[][]): unknown[] {
  const map = new Map<string, unknown>()
  for (const batch of batches) {
    for (const tx of batch) {
      map.set(txDedupKey(tx), tx)
    }
  }
  return Array.from(map.values())
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Enable Banking recomienda:
 * - longest (sin date_from): máximo historial disponible
 * - default + rango reciente: movimientos nuevos en sincronizaciones posteriores
 */
export async function getAllAccountTransactions(
  accountUid: string,
  options?: { sinceDate?: string | null }
): Promise<FetchAllTransactionsResult> {
  const today = isoDate(new Date())
  const from90 = isoDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))

  const passes: Array<{ name: string; count: number; pages: number }> = []
  const batches: unknown[][] = []
  let totalPages = 0
  let truncated = false

  const longest = await safePaginate(accountUid, 'longest', { strategy: 'longest' })
  batches.push(longest.transactions)
  passes.push({ name: 'longest', count: longest.transactions.length, pages: longest.pages })
  totalPages += longest.pages
  truncated = truncated || longest.truncated

  const recent = await safePaginate(accountUid, 'recent_90d', {
    strategy: 'default',
    date_from: from90,
    date_to: today,
  })
  batches.push(recent.transactions)
  passes.push({ name: 'recent_90d', count: recent.transactions.length, pages: recent.pages })
  totalPages += recent.pages
  truncated = truncated || recent.truncated

  if (options?.sinceDate) {
    const fromDb = isoDate(new Date(new Date(options.sinceDate).getTime() - 14 * 24 * 60 * 60 * 1000))
    const incremental = await safePaginate(accountUid, 'incremental', {
      strategy: 'default',
      date_from: fromDb,
      date_to: today,
    })
    batches.push(incremental.transactions)
    passes.push({ name: 'incremental', count: incremental.transactions.length, pages: incremental.pages })
    totalPages += incremental.pages
    truncated = truncated || incremental.truncated
  }

  const merged = mergeTransactions(batches)

  return {
    transactions: merged,
    pages: totalPages,
    truncated,
    passes,
  }
}
