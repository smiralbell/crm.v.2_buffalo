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

export type EnableBankingApiLogEntry = {
  pass_name: string
  page_number: number
  duration_ms: number
  request: {
    strategy?: string
    date_from?: string
    date_to?: string
    continuation_key_preview?: string | null
  }
  response: {
    ok: boolean
    error?: string
    status?: number
    top_level_keys: string[]
    transaction_count: number
    continuation_key_preview: string | null
    /** Respuesta cruda de Enable Banking (página 1 de cada pase) */
    raw_response?: unknown
    transactions_preview?: unknown[]
  }
}

export interface FetchAllTransactionsResult {
  transactions: unknown[]
  pages: number
  truncated: boolean
  passes: Array<{ name: string; count: number; pages: number; truncated?: boolean }>
  date_from: string
  date_to: string
  api_error?: string
  api_logs?: EnableBankingApiLogEntry[]
}

type PageParams = {
  strategy?: 'default' | 'longest'
  date_from?: string
  date_to?: string
}

function txDedupKey(tx: unknown): string {
  const t = tx as RawTx
  if (t.entry_reference) return `ref:${t.entry_reference}`
  const date = t.booking_date || t.value_date || t.transaction_date || ''
  const amt = t.transaction_amount?.amount ?? ''
  const desc = t.remittance_information?.[0] ?? ''
  return `k:${date}|${amt}|${desc}`
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function ckPreview(key: string | null | undefined): string | null {
  if (!key || typeof key !== 'string') return null
  return key.length > 32 ? `${key.slice(0, 32)}…` : key
}

function buildMonthlyRanges(
  fromIso: string,
  toIso: string
): Array<{ from: string; to: string; label: string }> {
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

function mergeTransactions(batches: unknown[][]): unknown[] {
  const map = new Map<string, unknown>()
  for (const batch of batches) {
    for (const tx of batch) {
      map.set(txDedupKey(tx), tx)
    }
  }
  return Array.from(map.values())
}

async function paginatePassWithLogs(
  accountUid: string,
  passName: string,
  firstPageParams: PageParams,
  maxPages = 100
): Promise<{
  transactions: unknown[]
  pages: number
  truncated: boolean
  logs: EnableBankingApiLogEntry[]
  error?: string
}> {
  const out: unknown[] = []
  const logs: EnableBankingApiLogEntry[] = []
  let continuationKey: string | undefined
  let pages = 0
  let passError: string | undefined

  try {
    do {
      const pageNum = pages + 1
      const requestParams: EnableBankingApiLogEntry['request'] = continuationKey
        ? { continuation_key_preview: ckPreview(continuationKey) }
        : {
            strategy: firstPageParams.strategy,
            date_from: firstPageParams.date_from,
            date_to: firstPageParams.date_to,
          }

      const started = Date.now()
      let raw: Record<string, unknown>
      try {
        raw = (await getAccountTransactions(
          accountUid,
          continuationKey ? { continuation_key: continuationKey } : firstPageParams
        )) as Record<string, unknown>
      } catch (err) {
        const message =
          err instanceof EnableBankingApiError
            ? `[${err.status}] ${err.message}`
            : err instanceof Error
              ? err.message
              : 'Error desconocido'
        logs.push({
          pass_name: passName,
          page_number: pageNum,
          duration_ms: Date.now() - started,
          request: requestParams,
          response: {
            ok: false,
            error: message,
            status: err instanceof EnableBankingApiError ? err.status : undefined,
            top_level_keys: [],
            transaction_count: 0,
            continuation_key_preview: null,
          },
        })
        passError = message
        break
      }

      const txs = Array.isArray(raw.transactions) ? raw.transactions : []
      const ck = raw.continuation_key

      logs.push({
        pass_name: passName,
        page_number: pageNum,
        duration_ms: Date.now() - started,
        request: requestParams,
        response: {
          ok: true,
          top_level_keys: Object.keys(raw),
          transaction_count: txs.length,
          continuation_key_preview: ckPreview(typeof ck === 'string' ? ck : null),
          raw_response: pageNum === 1 ? raw : undefined,
          transactions_preview: txs.slice(0, 5),
        },
      })

      if (txs.length > 0) out.push(...txs)

      continuationKey = typeof ck === 'string' && ck ? ck : undefined
      pages++
    } while (continuationKey && pages < maxPages)
  } catch (err) {
    passError = err instanceof Error ? err.message : 'Error en paginación'
  }

  return {
    transactions: out,
    pages,
    truncated: Boolean(continuationKey && pages >= maxPages),
    logs,
    error: passError,
  }
}

/**
 * Histórico completo desde ene 2025 con log de cada petición/respuesta a Enable Banking.
 */
export async function getFullAccountTransactionsWithLogs(
  accountUid: string
): Promise<FetchAllTransactionsResult> {
  const today = isoDate(new Date())
  const fromHistory = FINANCE_BANK_MIN_DATE

  const passes: FetchAllTransactionsResult['passes'] = []
  const batches: unknown[][] = []
  const api_logs: EnableBankingApiLogEntry[] = []
  let totalPages = 0
  let truncated = false
  const passErrors: string[] = []

  const longest = await paginatePassWithLogs(
    accountUid,
    'longest',
    { strategy: 'longest', date_from: fromHistory },
    500
  )
  batches.push(longest.transactions)
  api_logs.push(...longest.logs)
  passes.push({
    name: 'longest',
    count: longest.transactions.length,
    pages: longest.pages,
    truncated: longest.truncated,
  })
  totalPages += longest.pages
  truncated = truncated || longest.truncated
  if (longest.error) passErrors.push(`longest: ${longest.error}`)

  for (const month of buildMonthlyRanges(fromHistory, today)) {
    const pass = await paginatePassWithLogs(
      accountUid,
      `month_${month.label}`,
      { strategy: 'default', date_from: month.from, date_to: month.to },
      80
    )
    batches.push(pass.transactions)
    api_logs.push(...pass.logs)
    passes.push({
      name: `month_${month.label}`,
      count: pass.transactions.length,
      pages: pass.pages,
      truncated: pass.truncated,
    })
    totalPages += pass.pages
    truncated = truncated || pass.truncated
    if (pass.error) passErrors.push(`${month.label}: ${pass.error}`)
  }

  const merged = mergeTransactions(batches)
  const dates = (merged as RawTx[])
    .map((t) => t.booking_date || t.value_date || t.transaction_date || '')
    .filter(Boolean)
    .sort()

  console.info(
    `[enable-banking] full sync ${fromHistory}→${today}: ${merged.length} txs, ` +
      `${api_logs.length} api calls logged, range ${dates[0] ?? '—'}→${dates[dates.length - 1] ?? '—'}`
  )

  return {
    transactions: merged,
    pages: totalPages,
    truncated,
    date_from: fromHistory,
    date_to: today,
    api_error: passErrors.length > 0 ? passErrors.join(' | ') : undefined,
    api_logs,
    passes,
  }
}

async function paginateTransactions(
  accountUid: string,
  firstPageParams: PageParams,
  maxPages = 100
): Promise<{ transactions: unknown[]; pages: number; truncated: boolean }> {
  const r = await paginatePassWithLogs(accountUid, 'inline', firstPageParams, maxPages)
  return { transactions: r.transactions, pages: r.pages, truncated: r.truncated }
}

/**
 * Sync incremental: movimientos desde dateFrom hasta hoy.
 */
export async function getIncrementalAccountTransactions(
  accountUid: string,
  dateFrom: string
): Promise<FetchAllTransactionsResult> {
  const today = isoDate(new Date())
  let apiError: string | undefined

  const pass = await paginatePassWithLogs(
    accountUid,
    'incremental',
    { strategy: 'default', date_from: dateFrom, date_to: today },
    100
  )

  if (pass.error) apiError = pass.error

  return {
    transactions: pass.transactions,
    pages: pass.pages,
    truncated: pass.truncated,
    date_from: dateFrom,
    date_to: today,
    api_error: apiError,
    api_logs: pass.logs,
    passes: [
      {
        name: 'incremental',
        count: pass.transactions.length,
        pages: pass.pages,
        truncated: pass.truncated,
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
