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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function ckPreview(key: string | null | undefined): string | null {
  if (!key || typeof key !== 'string') return null
  return key.length > 32 ? `${key.slice(0, 32)}…` : key
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
        ? {
            strategy: firstPageParams.strategy,
            date_from: firstPageParams.date_from,
            date_to: firstPageParams.date_to,
            continuation_key_preview: ckPreview(continuationKey),
          }
        : {
            strategy: firstPageParams.strategy,
            date_from: firstPageParams.date_from,
            date_to: firstPageParams.date_to,
          }

      const started = Date.now()
      let raw: Record<string, unknown>
      const apiParams = continuationKey
        ? { ...firstPageParams, continuation_key: continuationKey }
        : firstPageParams
      try {
        raw = (await getAccountTransactions(accountUid, apiParams)) as Record<string, unknown>
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
 * Histórico completo vía strategy=longest (paginación con continuation_key).
 * No hace un pase por mes: evita 422 por periodos inexistentes y el límite 429 del consentimiento.
 */
export async function getFullAccountTransactionsWithLogs(
  accountUid: string,
  options?: { dateFromSuggestion?: string }
): Promise<FetchAllTransactionsResult> {
  const today = isoDate(new Date())
  const fromSuggestion = options?.dateFromSuggestion ?? FINANCE_BANK_MIN_DATE

  const longest = await paginatePassWithLogs(
    accountUid,
    'longest',
    { strategy: 'longest', date_from: fromSuggestion },
    500
  )

  const merged = longest.transactions
  const dates = (merged as RawTx[])
    .map((t) => t.booking_date || t.value_date || t.transaction_date || '')
    .filter(Boolean)
    .sort()

  console.info(
    `[enable-banking] full sync longest ${fromSuggestion}→${today}: ${merged.length} txs, ` +
      `${longest.logs.length} api calls, range ${dates[0] ?? '—'}→${dates[dates.length - 1] ?? '—'}`
  )

  return {
    transactions: merged,
    pages: longest.pages,
    truncated: longest.truncated,
    date_from: dates[0] ?? fromSuggestion,
    date_to: today,
    api_error: longest.error,
    api_logs: longest.logs,
    passes: [
      {
        name: 'longest',
        count: merged.length,
        pages: longest.pages,
        truncated: longest.truncated,
      },
    ],
  }
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
