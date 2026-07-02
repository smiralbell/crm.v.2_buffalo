import { getAccountTransactions } from './client'
import { previousCalendarMonth } from './sync-window'

export type BankApiDebugSample = {
  month_label: string
  request: { date_from: string; date_to: string; strategy: string }
  first_page: {
    top_level_keys: string[]
    transaction_count: number
    has_continuation_key: boolean
    continuation_key_preview: string | null
  }
  sample_transaction: unknown | null
  sample_transaction_keys: string[]
  all_transactions_preview: Array<{
    booking_date?: string
    value_date?: string
    amount?: string
    description?: string
    credit_debit_indicator?: string
  }>
}

function summarizeTx(tx: unknown): BankApiDebugSample['all_transactions_preview'][0] {
  if (!tx || typeof tx !== 'object') return {}
  const t = tx as Record<string, unknown>
  const amt = t.transaction_amount as { amount?: string } | undefined
  const rem = t.remittance_information as string[] | undefined
  return {
    booking_date: typeof t.booking_date === 'string' ? t.booking_date : undefined,
    value_date: typeof t.value_date === 'string' ? t.value_date : undefined,
    amount: amt?.amount,
    description: Array.isArray(rem) ? rem[0] : undefined,
    credit_debit_indicator:
      typeof t.credit_debit_indicator === 'string' ? t.credit_debit_indicator : undefined,
  }
}

/** Una página del mes anterior — para inspeccionar la respuesta cruda de Enable Banking */
export async function fetchSampleMonthApiDebug(accountUid: string): Promise<BankApiDebugSample> {
  const month = previousCalendarMonth()
  const request = {
    date_from: month.from,
    date_to: month.to,
    strategy: 'default' as const,
  }

  const raw = (await getAccountTransactions(accountUid, request)) as Record<string, unknown>
  const txs = Array.isArray(raw.transactions) ? raw.transactions : []
  const first = txs[0] ?? null
  const ck = raw.continuation_key

  return {
    month_label: month.label,
    request: { ...request, strategy: 'default' },
    first_page: {
      top_level_keys: Object.keys(raw),
      transaction_count: txs.length,
      has_continuation_key: typeof ck === 'string' && ck.length > 0,
      continuation_key_preview:
        typeof ck === 'string' && ck.length > 0 ? `${ck.slice(0, 24)}…` : null,
    },
    sample_transaction: first,
    sample_transaction_keys:
      first && typeof first === 'object' ? Object.keys(first as object).sort() : [],
    all_transactions_preview: txs.slice(0, 8).map(summarizeTx),
  }
}
