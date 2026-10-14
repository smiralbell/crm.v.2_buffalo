import { aggregateAdditiveStats, isIsoDate, monthDateBounds, toFiniteNumber } from '@/lib/integrations/meta/ads-parse'
import { inspectMetaAdsAccess, type MetaAdsAccessReport } from '@/lib/integrations/meta/ads-access'
import { fetchPeriodCampaignReach } from '@/lib/integrations/meta/ads-graph'
import { getMetaAdsConfig } from '@/lib/integrations/meta/config'
import {
  listCrmLeadsByCampaign,
  listDailyStats,
  listPeriodReach,
  listStoredCampaigns,
  listSyncState,
  upsertPeriodReach,
  type MetaAdDailyStatRow,
} from '@/lib/integrations/meta/ads-store'

export type MetaAdsCampaignListRow = {
  id: string
  ad_account_id: string
  name: string
  status: string | null
  effective_status: string | null
  objective: string | null
  daily_budget: number | null
  lifetime_budget: number | null
  start_time: string | null
  stop_time: string | null
  spend: number | null
  impressions: number | null
  reach: number | null
  reach_available: boolean
  link_clicks: number | null
  landing_page_views: number | null
  leads_meta: number | null
  cpc: number | null
  cost_per_lead: number | null
  currency: string | null
  crm_leads: number
  crm_events: number
  days: {
    date: string
    spend: number | null
    impressions: number | null
    reach: number | null
    link_clicks: number | null
    landing_page_views: number | null
    leads_meta: number | null
    cpc: number | null
    cost_per_lead: number | null
  }[]
}

const periodReachFetchedAt = new Map<string, number>()

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10) || null
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoLocalFromPgDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  // pg DATE llega como Date UTC a medianoche
  return iso(d) || ''
}

function fromDaily(row: MetaAdDailyStatRow) {
  return {
    date: isoLocalFromPgDate(row.stat_date),
    spend: toFiniteNumber(row.spend),
    impressions: toFiniteNumber(row.impressions),
    reach: toFiniteNumber(row.reach),
    link_clicks: toFiniteNumber(row.link_clicks),
    landing_page_views: toFiniteNumber(row.landing_page_views),
    leads_meta: toFiniteNumber(row.leads),
    cpc: toFiniteNumber(row.cpc),
    cost_per_lead: toFiniteNumber(row.cost_per_lead),
    currency: row.currency,
  }
}

export async function listMetaAdsCampaigns(input: {
  since?: string
  until?: string
  period?: string
}): Promise<{
  since: string
  until: string
  campaigns: MetaAdsCampaignListRow[]
  summary: {
    campaigns: number
    spend: number | null
    impressions: number | null
    link_clicks: number | null
    landing_page_views: number | null
    leads_meta: number | null
    crm_leads: number
    cpc: number | null
    cost_per_lead: number | null
    reach: number | null
    reach_available: boolean
  }
  access: MetaAdsAccessReport
  sync: Awaited<ReturnType<typeof listSyncState>>
}> {
  const bounds = input.period ? monthDateBounds(input.period) : null
  const since = input.since && isIsoDate(input.since) ? input.since : bounds?.since || monthDateBounds(currentPeriod()).since
  const until = input.until && isIsoDate(input.until) ? input.until : bounds?.until || monthDateBounds(currentPeriod()).until
  const range = since <= until ? { since, until } : { since: until, until: since }

  const [access, campaigns, daily, crm, sync] = await Promise.all([
    inspectMetaAdsAccess(),
    listStoredCampaigns(),
    listDailyStats(range.since, range.until),
    listCrmLeadsByCampaign(range.since, range.until),
    listSyncState(),
  ])
  let periodReach = await listPeriodReach(range.since, range.until)
  const cfg = getMetaAdsConfig()
  const accountIds = Array.from(new Set(campaigns.map((c) => c.ad_account_id).filter(Boolean)))
  const reachKey = `${range.since}:${range.until}`
  const reachAge = periodReachFetchedAt.get(reachKey) || 0
  const reachStale = Date.now() - reachAge > 60 * 60_000
  if (cfg.adsToken && accountIds.length && (periodReach.length === 0 || reachStale)) {
    try {
      for (const accountId of accountIds) {
        const map = await fetchPeriodCampaignReach(accountId, range.since, range.until, cfg)
        await upsertPeriodReach(accountId, range.since, range.until, map)
      }
      periodReach = await listPeriodReach(range.since, range.until)
      periodReachFetchedAt.set(reachKey, Date.now())
    } catch {
      periodReachFetchedAt.set(reachKey, Date.now())
    }
  }

  const daysByCampaign = new Map<string, ReturnType<typeof fromDaily>[]>()
  for (const row of daily) {
    const parsed = fromDaily(row)
    const list = daysByCampaign.get(row.campaign_id) || []
    list.push(parsed)
    daysByCampaign.set(row.campaign_id, list)
  }

  const reachByCampaign = new Map(periodReach.map((r) => [r.campaign_id, r.reach]))
  const singleDay = range.since === range.until

  const rows: MetaAdsCampaignListRow[] = campaigns.map((c) => {
    const days = daysByCampaign.get(c.id) || []
    let periodReachValue = reachByCampaign.has(c.id) ? reachByCampaign.get(c.id) ?? null : null
    if (periodReachValue == null && singleDay && days.length === 1) {
      periodReachValue = days[0].reach
    }
    const reach_available = periodReachValue != null || (singleDay && days.length === 1 && days[0].reach != null)
    const totals = aggregateAdditiveStats(
      days.map((d) => ({
        spend: d.spend,
        impressions: d.impressions,
        link_clicks: d.link_clicks,
        landing_page_views: d.landing_page_views,
        leads: d.leads_meta,
      })),
      reach_available ? periodReachValue : null
    )
    const crmRow = crm.get(c.id)
    return {
      id: c.id,
      ad_account_id: c.ad_account_id,
      name: c.name,
      status: c.effective_status || c.status,
      effective_status: c.effective_status,
      objective: c.objective,
      daily_budget: c.daily_budget,
      lifetime_budget: c.lifetime_budget,
      start_time: c.start_time ? c.start_time.toISOString() : null,
      stop_time: c.stop_time ? c.stop_time.toISOString() : null,
      spend: totals.spend,
      impressions: totals.impressions,
      reach: totals.reach,
      reach_available,
      link_clicks: totals.link_clicks,
      landing_page_views: totals.landing_page_views,
      leads_meta: totals.leads,
      cpc: totals.cpc,
      cost_per_lead: totals.cost_per_lead,
      currency: c.currency || days.find((d) => d.currency)?.currency || null,
      crm_leads: crmRow?.leads || 0,
      crm_events: crmRow?.events || 0,
      days,
    }
  })

  rows.sort((a, b) => (b.spend || 0) - (a.spend || 0) || a.name.localeCompare(b.name, 'es'))

  const additive = aggregateAdditiveStats(
    rows.map((r) => ({
      spend: r.spend,
      impressions: r.impressions,
      link_clicks: r.link_clicks,
      landing_page_views: r.landing_page_views,
      leads: r.leads_meta,
    })),
    null
  )
  const allReachKnown = rows.length > 0 && rows.every((r) => r.reach_available)
  // El alcance único de la cuenta no es la suma de campañas (pueden solaparse). No lo inventamos.
  const summaryReach = rows.length === 1 && rows[0].reach_available ? rows[0].reach : null

  return {
    since: range.since,
    until: range.until,
    campaigns: rows,
    summary: {
      campaigns: rows.length,
      spend: additive.spend,
      impressions: additive.impressions,
      link_clicks: additive.link_clicks,
      landing_page_views: additive.landing_page_views,
      leads_meta: additive.leads,
      crm_leads: rows.reduce((n, r) => n + r.crm_leads, 0),
      cpc: additive.cpc,
      cost_per_lead: additive.cost_per_lead,
      reach: summaryReach,
      reach_available: allReachKnown && rows.length === 1,
    },
    access,
    sync,
  }
}

function currentPeriod(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
