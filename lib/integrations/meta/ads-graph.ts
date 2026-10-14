import { getMetaAdsConfig, type MetaAdsConfig } from '@/lib/integrations/meta/config'
import {
  parseCampaignRow,
  parseInsightRow,
  parsePeriodReachRow,
  stripAccessToken,
  type MetaAdsCampaignSnapshot,
  type MetaAdsDailyInsight,
} from '@/lib/integrations/meta/ads-parse'

const RETRY_CODES = new Set([1, 2, 4, 17, 32, 613, 80004])
const MAX_ATTEMPTS = 4

export class MetaAdsApiError extends Error {
  status: number
  code: number | null
  constructor(message: string, status = 502, code: number | null = null) {
    super(message)
    this.name = 'MetaAdsApiError'
    this.status = status
    this.code = code
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function graphErrorMessage(json: unknown, status: number): { message: string; code: number | null } {
  const rec = asRecord(json)
  const err = rec ? asRecord(rec.error) : null
  const message = String(err?.message || rec?.message || `Graph API ${status}`)
  const code = typeof err?.code === 'number' ? err.code : toFiniteInt(err?.code)
  return { message, code }
}

function toFiniteInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

async function graphFetch(
  pathOrUrl: string,
  params: Record<string, string>,
  token: string,
  cfg: MetaAdsConfig
): Promise<unknown> {
  const absolute = pathOrUrl.startsWith('http')
  const base = `https://graph.facebook.com/${cfg.graphVersion}`
  const url = new URL(absolute ? pathOrUrl : `${base}/${pathOrUrl.replace(/^\//, '')}`)
  if (!absolute) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('access_token', token)
  }

  let lastError: MetaAdsApiError | null = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } })
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        throw new MetaAdsApiError(`Graph API respuesta no JSON (${res.status})`, res.status)
      }
      if (!res.ok) {
        const { message, code } = graphErrorMessage(json, res.status)
        const err = new MetaAdsApiError(message, res.status, code)
        const retryable = RETRY_CODES.has(code ?? -1) || res.status === 429 || res.status >= 500
        if (retryable && attempt < MAX_ATTEMPTS - 1) {
          const retryAfter = Number(res.headers.get('retry-after') || '')
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt
          await sleep(wait)
          lastError = err
          continue
        }
        throw err
      }
      return json
    } catch (e) {
      if (e instanceof MetaAdsApiError) {
        lastError = e
        if (attempt < MAX_ATTEMPTS - 1 && (e.status >= 500 || RETRY_CODES.has(e.code ?? -1))) {
          await sleep(400 * 2 ** attempt)
          continue
        }
        throw e
      }
      const msg = e instanceof Error ? e.message : 'Error de red Graph'
      lastError = new MetaAdsApiError(stripAccessToken(msg), 502)
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(400 * 2 ** attempt)
        continue
      }
      throw lastError
    }
  }
  throw lastError || new MetaAdsApiError('Graph API sin respuesta')
}

async function paginate(
  path: string,
  params: Record<string, string>,
  token: string,
  cfg: MetaAdsConfig
): Promise<unknown[]> {
  const rows: unknown[] = []
  let next: string | null = null
  let first = true
  let pages = 0
  while (first || next) {
    if (++pages > 80) break
    const json = first
      ? await graphFetch(path, { ...params, limit: params.limit || '200' }, token, cfg)
      : await graphFetch(next as string, {}, token, cfg)
    first = false
    const rec = asRecord(json)
    const data = rec?.data
    if (Array.isArray(data)) rows.push(...data)
    else if (rec && !Array.isArray(rec.data) && rec.id) rows.push(rec)
    const paging = rec ? asRecord(rec.paging) : null
    next = typeof paging?.next === 'string' && paging.next ? paging.next : null
  }
  return rows
}

function requireToken(cfg: MetaAdsConfig): string {
  if (!cfg.adsToken) {
    throw new MetaAdsApiError(
      'Falta un token de servidor con ads_read. Configura META_ADS_ACCESS_TOKEN.',
      503
    )
  }
  return cfg.adsToken
}

export async function graphGetMe(cfg = getMetaAdsConfig()): Promise<Record<string, unknown> | null> {
  const token = cfg.adsToken
  if (!token) return null
  try {
    const json = await graphFetch('me', { fields: 'id,name' }, token, cfg)
    return asRecord(json)
  } catch {
    return null
  }
}

export async function graphGetPermissions(cfg = getMetaAdsConfig()): Promise<string[]> {
  const token = cfg.adsToken
  if (!token) return []
  try {
    const rows = await paginate('me/permissions', {}, token, cfg)
    const granted: string[] = []
    for (const row of rows) {
      const rec = asRecord(row)
      if (!rec) continue
      if (String(rec.status || '') === 'granted' && rec.permission) {
        granted.push(String(rec.permission))
      }
    }
    return granted
  } catch {
    return []
  }
}

export async function graphListAdAccounts(cfg = getMetaAdsConfig()): Promise<{ id: string; name: string | null }[]> {
  const token = cfg.adsToken
  if (!token) return []
  const out: { id: string; name: string | null }[] = []
  try {
    const rows = await paginate('me/adaccounts', { fields: 'id,name,account_id,account_status' }, token, cfg)
    for (const row of rows) {
      const rec = asRecord(row)
      if (!rec) continue
      const id = String(rec.id || (rec.account_id ? `act_${rec.account_id}` : '')).trim()
      if (!id) continue
      out.push({ id, name: String(rec.name || '').trim() || null })
    }
  } catch {
    // token de página u otro tipo sin /me/adaccounts
  }
  if (!out.length && cfg.businessId) {
    try {
      const rows = await paginate(
        `${encodeURIComponent(cfg.businessId)}/owned_ad_accounts`,
        { fields: 'id,name,account_id' },
        token,
        cfg
      )
      for (const row of rows) {
        const rec = asRecord(row)
        if (!rec) continue
        const id = String(rec.id || '').trim()
        if (id) out.push({ id, name: String(rec.name || '').trim() || null })
      }
    } catch {
      // negocio no accesible con este token
    }
  }
  return out
}

const CAMPAIGN_FIELDS = [
  'id',
  'name',
  'status',
  'effective_status',
  'daily_budget',
  'lifetime_budget',
  'budget_remaining',
  'objective',
  'start_time',
  'stop_time',
  'created_time',
  'updated_time',
].join(',')

const INSIGHT_FIELDS = [
  'campaign_id',
  'campaign_name',
  'date_start',
  'date_stop',
  'spend',
  'impressions',
  'reach',
  'inline_link_clicks',
  'actions',
  'cost_per_action_type',
  'cost_per_inline_link_click',
  'cpc',
  'account_currency',
].join(',')

export async function fetchAdAccountCampaigns(
  adAccountId: string,
  cfg = getMetaAdsConfig()
): Promise<MetaAdsCampaignSnapshot[]> {
  const token = requireToken(cfg)
  const rows = await paginate(
    `${encodeURIComponent(adAccountId)}/campaigns`,
    {
      fields: CAMPAIGN_FIELDS,
      limit: '200',
    },
    token,
    cfg
  )
  return rows
    .map((row) => parseCampaignRow(row, adAccountId))
    .filter((row): row is MetaAdsCampaignSnapshot => Boolean(row))
}

export async function fetchDailyCampaignInsights(
  adAccountId: string,
  since: string,
  until: string,
  cfg = getMetaAdsConfig()
): Promise<MetaAdsDailyInsight[]> {
  const token = requireToken(cfg)
  const rows = await paginate(
    `${encodeURIComponent(adAccountId)}/insights`,
    {
      fields: INSIGHT_FIELDS,
      level: 'campaign',
      time_increment: '1',
      time_range: JSON.stringify({ since, until }),
      limit: '500',
    },
    token,
    cfg
  )
  return rows
    .map((row) => parseInsightRow(row, adAccountId))
    .filter((row): row is MetaAdsDailyInsight => Boolean(row))
}

/** Alcance único del periodo (no sumar filas diarias). */
export async function fetchPeriodCampaignReach(
  adAccountId: string,
  since: string,
  until: string,
  cfg = getMetaAdsConfig()
): Promise<Map<string, number | null>> {
  const token = requireToken(cfg)
  const rows = await paginate(
    `${encodeURIComponent(adAccountId)}/insights`,
    {
      fields: 'campaign_id,reach',
      level: 'campaign',
      time_range: JSON.stringify({ since, until }),
      limit: '500',
    },
    token,
    cfg
  )
  const map = new Map<string, number | null>()
  for (const row of rows) {
    const parsed = parsePeriodReachRow(row)
    if (parsed) map.set(parsed.campaign_id, parsed.reach)
  }
  return map
}
