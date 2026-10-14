/**
 * Conectores de gasto de Meta Ads y Google Ads.
 *
 * Sin tokens no se llama a ninguna API: la tarea `ads-sync` se omite y Sistema
 * muestra «apagado». Cuando hay credenciales, el worker guarda filas diarias en
 * ad_spend_daily y actualiza marketing_metrics (meta_ads / google_ads).
 */
import { query } from '@/lib/db'

export type AdsChannel = 'meta' | 'google'

export type AdSpendRow = {
  channel: AdsChannel
  date: string
  campaign_id: string
  campaign_name: string | null
  spend_eur: number
  impressions: number | null
  clicks: number | null
}

export function isMetaAdsConfigured(): boolean {
  return Boolean(process.env.META_ADS_ACCESS_TOKEN?.trim() && process.env.META_ADS_ACCOUNT_ID?.trim())
}

export function isGoogleAdsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() &&
      process.env.GOOGLE_ADS_CUSTOMER_ID?.trim() &&
      (process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() || process.env.GOOGLE_REFRESH_TOKEN?.trim()) &&
      process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  )
}

export function adsPeriodBounds(period: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null
  const [y, m] = period.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${period}-01`, end: `${period}-${String(last).padStart(2, '0')}` }
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function daysAgoRange(days: number, from = new Date()): { since: string; until: string } {
  const until = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const since = new Date(until)
  since.setUTCDate(since.getUTCDate() - Math.max(1, days) + 1)
  return { since: ymd(since), until: ymd(until) }
}

function actId(raw: string): string {
  const id = raw.trim().replace(/^act_/i, '')
  return `act_${id}`
}

function digits(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function mapMetaInsight(row: Record<string, unknown>): AdSpendRow | null {
  const date = typeof row.date_start === 'string' ? row.date_start.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const spend = Number(row.spend || 0)
  return {
    channel: 'meta',
    date,
    campaign_id: String(row.campaign_id || ''),
    campaign_name: row.campaign_name ? String(row.campaign_name) : null,
    spend_eur: Math.round(spend * 100) / 100,
    impressions: row.impressions != null ? Number(row.impressions) || 0 : null,
    clicks: row.clicks != null ? Number(row.clicks) || 0 : null,
  }
}

export function mapGoogleAdsRow(row: Record<string, unknown>): AdSpendRow | null {
  const campaign = (row.campaign && typeof row.campaign === 'object' ? row.campaign : {}) as Record<string, unknown>
  const metrics = (row.metrics && typeof row.metrics === 'object' ? row.metrics : {}) as Record<string, unknown>
  const segments = (row.segments && typeof row.segments === 'object' ? row.segments : {}) as Record<string, unknown>
  const date = typeof segments.date === 'string' ? segments.date.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const micros = Number(metrics.costMicros ?? metrics.cost_micros ?? 0)
  return {
    channel: 'google',
    date,
    campaign_id: String(campaign.id ?? ''),
    campaign_name: campaign.name ? String(campaign.name) : null,
    spend_eur: Math.round(micros / 10_000) / 100, // micros → euros, 2 decimales
    impressions: metrics.impressions != null ? Number(metrics.impressions) || 0 : null,
    clicks: metrics.clicks != null ? Number(metrics.clicks) || 0 : null,
  }
}

async function upsertRows(rows: AdSpendRow[]): Promise<number> {
  let n = 0
  for (const r of rows) {
    await query(
      `INSERT INTO ad_spend_daily (channel, date, campaign_id, campaign_name, spend_eur, impressions, clicks, raw, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
       ON CONFLICT (channel, date, campaign_id) DO UPDATE SET
         campaign_name = EXCLUDED.campaign_name,
         spend_eur = EXCLUDED.spend_eur,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         raw = EXCLUDED.raw,
         synced_at = NOW()`,
      [
        r.channel,
        r.date,
        r.campaign_id,
        r.campaign_name,
        r.spend_eur,
        r.impressions,
        r.clicks,
        JSON.stringify(r),
      ]
    )
    n++
  }
  return n
}

async function rollupMarketingMetrics(channel: AdsChannel, period: string): Promise<void> {
  const bounds = adsPeriodBounds(period)
  if (!bounds) return
  const metricsChannel = channel === 'meta' ? 'meta_ads' : 'google_ads'
  const { rows } = await query<{ spend: string; impressions: string; clicks: string }>(
    `SELECT COALESCE(SUM(spend_eur), 0) AS spend,
            COALESCE(SUM(impressions), 0) AS impressions,
            COALESCE(SUM(clicks), 0) AS clicks
       FROM ad_spend_daily
      WHERE channel = $1 AND date >= $2::date AND date <= $3::date`,
    [channel, bounds.start, bounds.end]
  )
  const spend = Number(rows[0]?.spend || 0)
  const impressions = Number(rows[0]?.impressions || 0)
  const clicks = Number(rows[0]?.clicks || 0)
  await query(
    `INSERT INTO marketing_metrics (channel, period, spend, impressions, clicks, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (channel, period) DO UPDATE SET
       spend = EXCLUDED.spend,
       impressions = EXCLUDED.impressions,
       clicks = EXCLUDED.clicks,
       updated_at = NOW()`,
    [metricsChannel, period, spend, impressions, clicks]
  )
}

async function fetchMeta(since: string, until: string): Promise<AdSpendRow[]> {
  const token = process.env.META_ADS_ACCESS_TOKEN!.trim()
  const account = actId(process.env.META_ADS_ACCOUNT_ID!)
  const out: AdSpendRow[] = []
  let url: string | null =
    `https://graph.facebook.com/v21.0/${account}/insights` +
    `?fields=campaign_id,campaign_name,spend,impressions,clicks,date_start` +
    `&level=campaign&time_increment=1` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&limit=500&access_token=${encodeURIComponent(token)}`

  while (url) {
    const res = await fetch(url)
    const json = (await res.json()) as {
      data?: Record<string, unknown>[]
      paging?: { next?: string }
      error?: { message?: string }
    }
    if (!res.ok) throw new Error(json.error?.message || `Meta Ads ${res.status}`)
    for (const row of json.data || []) {
      const mapped = mapMetaInsight(row)
      if (mapped) out.push(mapped)
    }
    url = json.paging?.next || null
  }
  return out
}

async function googleAccessToken(): Promise<string> {
  const refresh =
    process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() || process.env.GOOGLE_REFRESH_TOKEN?.trim() || ''
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  })
  const json = (await res.json()) as { access_token?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || `Google OAuth ${res.status}`)
  }
  return json.access_token
}

async function fetchGoogle(since: string, until: string): Promise<AdSpendRow[]> {
  const customerId = digits(process.env.GOOGLE_ADS_CUSTOMER_ID || '')
  const loginId = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '')
  const token = await googleAccessToken()
  const gaql =
    `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, segments.date ` +
    `FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}'`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!.trim(),
    'Content-Type': 'application/json',
  }
  if (loginId) headers['login-customer-id'] = loginId
  const res = await fetch(`https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: gaql }),
  })
  const json = (await res.json()) as {
    results?: Record<string, unknown>[]
    error?: { message?: string }
    message?: string
  }
  if (!res.ok) throw new Error(json.error?.message || json.message || `Google Ads ${res.status}`)
  const out: AdSpendRow[] = []
  for (const row of json.results || []) {
    const mapped = mapGoogleAdsRow(row)
    if (mapped) out.push(mapped)
  }
  return out
}

function periodsTouched(rows: AdSpendRow[]): string[] {
  return [...new Set(rows.map((r) => r.date.slice(0, 7)))]
}

export async function periodSpendFromAdsApi(period: string): Promise<Map<AdsChannel, number>> {
  const map = new Map<AdsChannel, number>()
  const bounds = adsPeriodBounds(period)
  if (!bounds) return map
  try {
    const { rows } = await query<{ channel: AdsChannel; spend: string }>(
      `SELECT channel, COALESCE(SUM(spend_eur), 0) AS spend
         FROM ad_spend_daily
        WHERE date >= $1::date AND date <= $2::date
        GROUP BY channel`,
      [bounds.start, bounds.end]
    )
    for (const r of rows) map.set(r.channel, Number(r.spend) || 0)
  } catch (e) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === '42P01') return map
    throw e
  }
  return map
}

export async function lastAdsSyncAt(channel: AdsChannel): Promise<Date | null> {
  try {
    const { rows } = await query<{ at: Date | null }>(
      `SELECT MAX(synced_at) AS at FROM ad_spend_daily WHERE channel = $1`,
      [channel]
    )
    return rows[0]?.at ?? null
  } catch {
    return null
  }
}

export async function syncAdSpend(opts: { days?: number } = {}): Promise<{
  meta: string
  google: string
  rows: number
}> {
  const { since, until } = daysAgoRange(opts.days ?? 14)
  let rows = 0
  let meta = 'sin configurar'
  let google = 'sin configurar'

  if (isMetaAdsConfigured()) {
    const list = await fetchMeta(since, until)
    rows += await upsertRows(list)
    for (const period of periodsTouched(list).length ? periodsTouched(list) : [until.slice(0, 7)]) {
      await rollupMarketingMetrics('meta', period)
    }
    meta = `${list.length} fila(s) ${since}→${until}`
  }

  if (isGoogleAdsConfigured()) {
    const list = await fetchGoogle(since, until)
    rows += await upsertRows(list)
    for (const period of periodsTouched(list).length ? periodsTouched(list) : [until.slice(0, 7)]) {
      await rollupMarketingMetrics('google', period)
    }
    google = `${list.length} fila(s) ${since}→${until}`
  }

  return { meta, google, rows }
}
