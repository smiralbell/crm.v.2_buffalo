import { FINANCE_BANK_MIN_DATE } from '@/lib/finance/period-presets'
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
  maxPages = 200
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

async function safePaginate(
  accountUid: string,
  name: string,
  params: PageParams,
  maxPages = 200
): Promise<{
  name: string
  transactions: unknown[]
  pages: number
  truncated: boolean
}> {
  try {
    const r = await paginateTransactions(accountUid, params, maxPages)
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

/** Rangos mensuales [from, to] inclusivos para no perder historial por límite de páginas */
function buildMonthlyRanges(fromIso: string, toIso: string): Array<{ from: string; to: string; label: string }> {
  const ranges: Array<{ from: string; to: string; label: string }> = []
  const start = new Date(fromIso)
  const end = new Date(toIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ranges

  let y = start.getFullYear()
  let m = start.getMonth()

  while (true) {
    const monthStart = new Date(y, m, 1)
    if (monthStart > end) break

    const monthEnd = new Date(y, m + 1, 0)
    const rangeEnd = monthEnd > end ? end : monthEnd

    ranges.push({
      from: isoDate(monthStart),
      to: isoDate(rangeEnd),
      label: `${y}-${String(m + 1).padStart(2, '0')}`,
    })

    m++
    if (m > 11) {
      m = 0
      y++
    }
  }

  return ranges
}

/**
 * Descarga todo el historial disponible desde FINANCE_BANK_MIN_DATE:
 * 1) strategy=longest (máximo historial del banco)
 * 2) Un pase por cada mes (evita truncar por paginación en rangos largos)
 */
export async function getAllAccountTransactions(
  accountUid: string,
  options?: { sinceDate?: string | null }
): Promise<FetchAllTransactionsResult> {
  const today = isoDate(new Date())
  const fromHistory = FINANCE_BANK_MIN_DATE

  const passes: FetchAllTransactionsResult['passes'] = []
  const batches: unknown[][] = []
  let totalPages = 0
  let truncated = false

  const longest = await safePaginate(
    accountUid,
    'longest',
    { strategy: 'longest', date_from: fromHistory },
    500
  )
  batches.push(longest.transactions)
  passes.push({
    name: 'longest',
    count: longest.transactions.length,
    pages: longest.pages,
    truncated: longest.truncated,
  })
  totalPages += longest.pages
  truncated = truncated || longest.truncated

  const months = buildMonthlyRanges(fromHistory, today)
  for (const month of months) {
    const pass = await safePaginate(
      accountUid,
      `month_${month.label}`,
      {
        strategy: 'default',
        date_from: month.from,
        date_to: month.to,
      },
      80
    )
    batches.push(pass.transactions)
    passes.push({
      name: pass.name,
      count: pass.transactions.length,
      pages: pass.pages,
      truncated: pass.truncated,
    })
    totalPages += pass.pages
    truncated = truncated || pass.truncated
  }

  if (options?.sinceDate) {
    const fromDb = isoDate(new Date(new Date(options.sinceDate).getTime() - 14 * 24 * 60 * 60 * 1000))
    const incremental = await safePaginate(
      accountUid,
      'incremental',
      {
        strategy: 'default',
        date_from: fromDb,
        date_to: today,
      },
      100
    )
    batches.push(incremental.transactions)
    passes.push({
      name: 'incremental',
      count: incremental.transactions.length,
      pages: incremental.pages,
      truncated: incremental.truncated,
    })
    totalPages += incremental.pages
    truncated = truncated || incremental.truncated
  }

  const merged = mergeTransactions(batches)

  if (merged.length > 0) {
    const dates = (merged as RawTx[])
      .map((t) => t.booking_date || t.value_date || t.transaction_date || '')
      .filter(Boolean)
      .sort()
    console.info(
      `[enable-banking] fetched ${merged.length} txs, ${passes.length} passes, ` +
        `range ${dates[0] ?? '?'} → ${dates[dates.length - 1] ?? '?'}, truncated=${truncated}`
    )
  }

  return {
    transactions: merged,
    pages: totalPages,
    truncated,
    passes,
  }
}
