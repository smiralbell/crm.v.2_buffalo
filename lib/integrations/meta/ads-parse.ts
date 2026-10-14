export type MetaAdsDailyInsight = {
  campaign_id: string
  campaign_name: string | null
  ad_account_id: string
  stat_date: string
  spend: number | null
  impressions: number | null
  reach: number | null
  link_clicks: number | null
  landing_page_views: number | null
  leads: number | null
  cpc: number | null
  cost_per_lead: number | null
  currency: string | null
}

export type MetaAdsCampaignSnapshot = {
  id: string
  ad_account_id: string
  name: string
  status: string | null
  effective_status: string | null
  objective: string | null
  daily_budget: number | null
  lifetime_budget: number | null
  budget_remaining: number | null
  currency: string | null
  start_time: string | null
  stop_time: string | null
  created_time: string | null
  updated_time: string | null
}

export type MetaAdsPeriodTotals = {
  spend: number | null
  impressions: number | null
  reach: number | null
  link_clicks: number | null
  landing_page_views: number | null
  leads: number | null
  cpc: number | null
  cost_per_lead: number | null
}

const LEAD_ACTION_TYPES = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'omni_lead',
]

const LINK_CLICK_ACTION_TYPES = ['link_click', 'inline_link_click']
const LANDING_PAGE_ACTION_TYPES = ['landing_page_view']

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function toFiniteNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`))
}

export function monthDateBounds(period: string): { since: string; until: string } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(y, (m || 1) - 1, 1)
  const end = new Date(y, m || 1, 0)
  return { since: isoDateLocal(start), until: isoDateLocal(end) }
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return isoDateLocal(dt)
}

export function chunkDateRange(since: string, until: string, maxDays = 31): { since: string; until: string }[] {
  if (!isIsoDate(since) || !isIsoDate(until) || since > until) return []
  const out: { since: string; until: string }[] = []
  let cursor = since
  while (cursor <= until) {
    const chunkEnd = addDaysIso(cursor, maxDays - 1)
    const end = chunkEnd < until ? chunkEnd : until
    out.push({ since: cursor, until: end })
    cursor = addDaysIso(end, 1)
  }
  return out
}

/** Presupuesto de campaña: Marketing API lo envía en céntimos. */
export function budgetFromCents(v: unknown): number | null {
  const n = toFiniteNumber(v)
  if (n == null) return null
  return Math.round(n) / 100
}

export function pickActionValue(actions: unknown, types: string[]): number | null {
  if (!Array.isArray(actions)) return null
  for (const type of types) {
    for (const item of actions) {
      const rec = asRecord(item)
      if (!rec) continue
      if (String(rec.action_type || '') !== type) continue
      const n = toFiniteNumber(rec.value)
      if (n != null) return n
    }
  }
  return null
}

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den <= 0) return null
  return num / den
}

/**
 * Si Meta devuelve la fila de insights, una action ausente es 0 (no hubo el evento).
 * Si no hay fila, no inventamos métricas: quedan null → «No disponible».
 */
export function parseInsightRow(
  raw: unknown,
  adAccountId: string
): MetaAdsDailyInsight | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const campaign_id = String(rec.campaign_id || rec.campaignId || '').trim()
  if (!campaign_id) return null
  const stat_date = String(rec.date_start || rec.date_stop || '').slice(0, 10)
  if (!isIsoDate(stat_date)) return null

  const spend = toFiniteNumber(rec.spend)
  const impressions = toFiniteNumber(rec.impressions)
  const reach = toFiniteNumber(rec.reach)
  const inline = toFiniteNumber(rec.inline_link_clicks)
  const linkFromActions = pickActionValue(rec.actions, LINK_CLICK_ACTION_TYPES)
  const link_clicks = inline ?? linkFromActions ?? 0
  const landing_page_views = pickActionValue(rec.actions, LANDING_PAGE_ACTION_TYPES) ?? 0
  const leads = pickActionValue(rec.actions, LEAD_ACTION_TYPES) ?? 0
  const apiCpc = toFiniteNumber(rec.cost_per_inline_link_click) ?? toFiniteNumber(rec.cpc)
  const apiCpl = pickActionValue(rec.cost_per_action_type, LEAD_ACTION_TYPES)

  return {
    campaign_id,
    campaign_name: String(rec.campaign_name || '').trim() || null,
    ad_account_id: adAccountId,
    stat_date,
    spend,
    impressions,
    reach,
    link_clicks,
    landing_page_views,
    leads,
    cpc: apiCpc ?? ratio(spend, link_clicks),
    cost_per_lead: apiCpl ?? ratio(spend, leads),
    currency: String(rec.account_currency || rec.currency || '').trim() || null,
  }
}

export function parseCampaignRow(raw: unknown, adAccountId: string): MetaAdsCampaignSnapshot | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const id = String(rec.id || '').trim()
  if (!id) return null
  const name = String(rec.name || '').trim() || id
  return {
    id,
    ad_account_id: adAccountId,
    name,
    status: String(rec.status || '').trim() || null,
    effective_status: String(rec.effective_status || '').trim() || null,
    objective: String(rec.objective || '').trim() || null,
    daily_budget: budgetFromCents(rec.daily_budget),
    lifetime_budget: budgetFromCents(rec.lifetime_budget),
    budget_remaining: budgetFromCents(rec.budget_remaining),
    currency: String(rec.currency || rec.account_currency || '').trim() || null,
    start_time: String(rec.start_time || '').trim() || null,
    stop_time: String(rec.stop_time || '').trim() || null,
    created_time: String(rec.created_time || '').trim() || null,
    updated_time: String(rec.updated_time || '').trim() || null,
  }
}

export function parsePeriodReachRow(raw: unknown): { campaign_id: string; reach: number | null } | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const campaign_id = String(rec.campaign_id || rec.campaignId || rec.id || '').trim()
  if (!campaign_id) return null
  return { campaign_id, reach: toFiniteNumber(rec.reach) }
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  let total = 0
  let saw = false
  for (const v of values) {
    if (v == null) continue
    total += v
    saw = true
  }
  return saw ? total : null
}

/** Alcance único y ratios no se suman: el alcance llega aparte; CPC/CPL se recalculan. */
export function aggregateAdditiveStats(
  days: Array<Pick<MetaAdsDailyInsight, 'spend' | 'impressions' | 'link_clicks' | 'landing_page_views' | 'leads'>>,
  periodReach: number | null
): MetaAdsPeriodTotals {
  if (!days.length) {
    return {
      spend: null,
      impressions: null,
      reach: periodReach,
      link_clicks: null,
      landing_page_views: null,
      leads: null,
      cpc: null,
      cost_per_lead: null,
    }
  }
  const spend = sumNullable(days.map((d) => d.spend))
  const impressions = sumNullable(days.map((d) => d.impressions))
  const link_clicks = sumNullable(days.map((d) => d.link_clicks))
  const landing_page_views = sumNullable(days.map((d) => d.landing_page_views))
  const leads = sumNullable(days.map((d) => d.leads))
  return {
    spend,
    impressions,
    reach: periodReach,
    link_clicks,
    landing_page_views,
    leads,
    cpc: ratio(spend, link_clicks),
    cost_per_lead: ratio(spend, leads),
  }
}

export function stripAccessToken(url: string): string {
  return url.replace(/([?&]access_token=)[^&]*/gi, '$1***')
}
