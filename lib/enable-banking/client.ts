import { randomUUID } from 'crypto'
import {
  ENABLEBANKING_API_BASE,
  EnableBankingConfigError,
  getEnableBankingAspspName,
  getEnableBankingConfig,
} from './config'
import { createEnableBankingJwt, validUntilIso } from './jwt'

export { EnableBankingConfigError }

export class EnableBankingApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'EnableBankingApiError'
    this.status = status
    this.detail = detail
  }
}

function parseErrorMessage(status: number, body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    if (typeof o.message === 'string' && o.message) return o.message
    if (typeof o.detail === 'string' && o.detail) return o.detail
    if (Array.isArray(o.detail)) {
      return o.detail.map((d) => (typeof d === 'string' ? d : JSON.stringify(d))).join('; ')
    }
    if (o.error && typeof o.error === 'object') {
      const err = o.error as Record<string, unknown>
      if (typeof err.message === 'string') return err.message
    }
  }
  if (typeof body === 'string' && body) return body
  return fallback || `Error Enable Banking (${status})`
}

async function enableBankingRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = createEnableBankingJwt()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${ENABLEBANKING_API_BASE}${path}`, {
    ...init,
    headers,
  })

  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    throw new EnableBankingApiError(
      res.status,
      parseErrorMessage(res.status, parsed, res.statusText),
      parsed
    )
  }

  return parsed as T
}

export interface StartAuthResponse {
  url: string
  authorization_id?: string
}

export interface SessionAccount {
  uid?: string
  name?: string
}

export interface AuthorizeSessionResponse {
  session_id: string
  accounts?: SessionAccount[]
  access?: { valid_until?: string }
}

export interface AspspItem {
  name: string
  country: string
  psu_types?: string[]
}

export async function listAspsps(country = 'ES'): Promise<AspspItem[]> {
  const fetchList = async (query: string) => {
    const data = await enableBankingRequest<{ aspsps?: AspspItem[] }>(`/aspsps?${query}`)
    return data.aspsps ?? []
  }

  let list = await fetchList(`country=${country}&psu_type=business&service=AIS`)
  if (!list.length) list = await fetchList(`country=${country}&service=AIS`)
  if (!list.length) list = await fetchList(`country=${country}`)

  return list.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export async function startAuthorization(bankName?: string): Promise<StartAuthResponse> {
  const { redirectUrl } = getEnableBankingConfig()
  const bank = bankName?.trim() || getEnableBankingAspspName()

  return enableBankingRequest<StartAuthResponse>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntilIso(90) },
      aspsp: { name: bank, country: 'ES' },
      state: randomUUID(),
      redirect_url: redirectUrl,
      psu_type: 'business',
    }),
  })
}

export async function authorizeSession(code: string): Promise<AuthorizeSessionResponse> {
  return enableBankingRequest<AuthorizeSessionResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function getAccountDetails(accountUid: string): Promise<unknown> {
  return enableBankingRequest(`/accounts/${encodeURIComponent(accountUid)}/details`)
}

export async function getAccountBalances(accountUid: string): Promise<unknown> {
  return enableBankingRequest(`/accounts/${encodeURIComponent(accountUid)}/balances`)
}

export async function getAccountTransactions(
  accountUid: string,
  params?: {
    continuation_key?: string
    date_from?: string
    date_to?: string
    transaction_status?: string
    strategy?: 'default' | 'longest'
  }
): Promise<unknown> {
  const qs = new URLSearchParams()
  if (params?.continuation_key) qs.set('continuation_key', params.continuation_key)
  if (params?.date_from) qs.set('date_from', params.date_from)
  if (params?.date_to) qs.set('date_to', params.date_to)
  if (params?.transaction_status) qs.set('transaction_status', params.transaction_status)
  if (params?.strategy) qs.set('strategy', params.strategy)
  const query = qs.toString()
  const path = `/accounts/${encodeURIComponent(accountUid)}/transactions${query ? `?${query}` : ''}`
  return enableBankingRequest(path)
}

export interface FetchAllTransactionsResult {
  transactions: unknown[]
  pages: number
  truncated: boolean
}

/** Descarga todo el historial disponible (strategy=longest + paginación) */
export async function getAllAccountTransactions(
  accountUid: string
): Promise<FetchAllTransactionsResult> {
  const all: unknown[] = []
  let continuationKey: string | undefined
  let pages = 0
  const maxPages = 100

  const dateFrom = new Date()
  dateFrom.setFullYear(dateFrom.getFullYear() - 2)
  const dateFromStr = dateFrom.toISOString().slice(0, 10)

  do {
    const page = (await getAccountTransactions(
      accountUid,
      continuationKey
        ? { continuation_key: continuationKey }
        : {
            transaction_status: 'BOOK',
            date_from: dateFromStr,
            strategy: 'longest',
          }
    )) as { transactions?: unknown[]; continuation_key?: string | null }

    if (Array.isArray(page.transactions)) {
      all.push(...page.transactions)
    }

    continuationKey =
      typeof page.continuation_key === 'string' && page.continuation_key
        ? page.continuation_key
        : undefined
    pages++
  } while (continuationKey && pages < maxPages)

  return {
    transactions: all,
    pages,
    truncated: Boolean(continuationKey && pages >= maxPages),
  }
}

export function extractOwnAccountIban(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null
  const d = details as Record<string, unknown>
  const accountId = d.account_id as { iban?: string } | undefined
  if (accountId?.iban) return accountId.iban

  const allIds = d.all_account_ids as Array<{ identification?: string; scheme_name?: string }> | undefined
  if (Array.isArray(allIds)) {
    const ibanEntry = allIds.find((x) => x.scheme_name?.toUpperCase() === 'IBAN')
    if (ibanEntry?.identification) return ibanEntry.identification
  }

  return null
}
