import { randomUUID } from 'crypto'
import {
  ENABLEBANKING_API_BASE,
  EnableBankingConfigError,
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

export async function startAuthorization(bankName: string): Promise<StartAuthResponse> {
  const { redirectUrl } = getEnableBankingConfig()

  return enableBankingRequest<StartAuthResponse>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntilIso(90) },
      aspsp: { name: bankName, country: 'ES' },
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

export async function getAccountBalances(accountUid: string): Promise<unknown> {
  return enableBankingRequest(`/accounts/${encodeURIComponent(accountUid)}/balances`)
}

export async function getAccountTransactions(accountUid: string): Promise<unknown> {
  return enableBankingRequest(`/accounts/${encodeURIComponent(accountUid)}/transactions`)
}
