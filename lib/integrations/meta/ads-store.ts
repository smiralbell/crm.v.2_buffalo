import { prisma } from '@/lib/prisma'
import type { MetaAdsCampaignSnapshot, MetaAdsDailyInsight } from '@/lib/integrations/meta/ads-parse'
import { ensureMetaLeadEventsTable } from '@/lib/integrations/meta/store'

let schemaEnsured = false

export async function ensureMetaAdsTables(): Promise<void> {
  if (schemaEnsured) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_ad_campaigns (
      id                TEXT PRIMARY KEY,
      ad_account_id     TEXT NOT NULL,
      name              TEXT NOT NULL,
      status            TEXT,
      effective_status  TEXT,
      objective         TEXT,
      daily_budget      NUMERIC(14, 2),
      lifetime_budget   NUMERIC(14, 2),
      budget_remaining  NUMERIC(14, 2),
      currency          TEXT,
      start_time        TIMESTAMPTZ,
      stop_time         TIMESTAMPTZ,
      created_time      TIMESTAMPTZ,
      updated_time      TIMESTAMPTZ,
      last_synced_at    TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_ad_campaign_daily_stats (
      campaign_id         TEXT NOT NULL,
      stat_date           DATE NOT NULL,
      ad_account_id       TEXT NOT NULL,
      spend               NUMERIC(14, 2),
      impressions         BIGINT,
      reach               BIGINT,
      link_clicks         BIGINT,
      landing_page_views  BIGINT,
      leads               BIGINT,
      cpc                 NUMERIC(14, 4),
      cost_per_lead       NUMERIC(14, 4),
      currency            TEXT,
      synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (campaign_id, stat_date)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_ad_period_reach (
      campaign_id   TEXT NOT NULL,
      ad_account_id TEXT NOT NULL,
      date_start    DATE NOT NULL,
      date_stop     DATE NOT NULL,
      reach         BIGINT,
      fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (campaign_id, date_start, date_stop)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS meta_ad_sync_state (
      ad_account_id   TEXT PRIMARY KEY,
      last_synced_at  TIMESTAMPTZ,
      last_since      DATE,
      last_until      DATE,
      last_error      TEXT,
      campaigns       INT NOT NULL DEFAULT 0,
      days            INT NOT NULL DEFAULT 0
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_account_date ON meta_ad_campaign_daily_stats (ad_account_id, stat_date)`
  )
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meta_ad_campaigns_account ON meta_ad_campaigns (ad_account_id)`
  )
  await ensureMetaLeadEventsTable()
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_meta_lead_events_campaign ON meta_lead_events (campaign_id)`
  )
  schemaEnsured = true
}

function ts(v: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function upsertMetaAdCampaigns(
  campaigns: MetaAdsCampaignSnapshot[]
): Promise<{ upserted: number; inserted: number }> {
  await ensureMetaAdsTables()
  let upserted = 0
  let inserted = 0
  for (const c of campaigns) {
    const rows = await prisma.$queryRawUnsafe<{ is_insert: boolean }[]>(
      `INSERT INTO meta_ad_campaigns (
         id, ad_account_id, name, status, effective_status, objective,
         daily_budget, lifetime_budget, budget_remaining, currency,
         start_time, stop_time, created_time, updated_time, last_synced_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()
       )
       ON CONFLICT (id) DO UPDATE SET
         ad_account_id = EXCLUDED.ad_account_id,
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         effective_status = EXCLUDED.effective_status,
         objective = EXCLUDED.objective,
         daily_budget = EXCLUDED.daily_budget,
         lifetime_budget = EXCLUDED.lifetime_budget,
         budget_remaining = EXCLUDED.budget_remaining,
         currency = COALESCE(EXCLUDED.currency, meta_ad_campaigns.currency),
         start_time = EXCLUDED.start_time,
         stop_time = EXCLUDED.stop_time,
         created_time = COALESCE(EXCLUDED.created_time, meta_ad_campaigns.created_time),
         updated_time = EXCLUDED.updated_time,
         last_synced_at = NOW()
       RETURNING (xmax = 0) AS is_insert`,
      c.id,
      c.ad_account_id,
      c.name,
      c.status,
      c.effective_status,
      c.objective,
      c.daily_budget,
      c.lifetime_budget,
      c.budget_remaining,
      c.currency,
      ts(c.start_time),
      ts(c.stop_time),
      ts(c.created_time),
      ts(c.updated_time)
    )
    upserted++
    if (rows[0]?.is_insert) inserted++
  }
  return { upserted, inserted }
}

export async function upsertMetaAdDailyStats(rows: MetaAdsDailyInsight[]): Promise<number> {
  await ensureMetaAdsTables()
  let n = 0
  for (const r of rows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO meta_ad_campaign_daily_stats (
         campaign_id, stat_date, ad_account_id, spend, impressions, reach,
         link_clicks, landing_page_views, leads, cpc, cost_per_lead, currency, synced_at
       ) VALUES (
         $1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
       )
       ON CONFLICT (campaign_id, stat_date) DO UPDATE SET
         ad_account_id = EXCLUDED.ad_account_id,
         spend = EXCLUDED.spend,
         impressions = EXCLUDED.impressions,
         reach = EXCLUDED.reach,
         link_clicks = EXCLUDED.link_clicks,
         landing_page_views = EXCLUDED.landing_page_views,
         leads = EXCLUDED.leads,
         cpc = EXCLUDED.cpc,
         cost_per_lead = EXCLUDED.cost_per_lead,
         currency = COALESCE(EXCLUDED.currency, meta_ad_campaign_daily_stats.currency),
         synced_at = NOW()`,
      r.campaign_id,
      r.stat_date,
      r.ad_account_id,
      r.spend,
      r.impressions,
      r.reach,
      r.link_clicks,
      r.landing_page_views,
      r.leads,
      r.cpc,
      r.cost_per_lead,
      r.currency
    )
    n++
  }
  return n
}

export async function upsertPeriodReach(
  adAccountId: string,
  since: string,
  until: string,
  reachByCampaign: Map<string, number | null>
): Promise<void> {
  await ensureMetaAdsTables()
  for (const [campaignId, reach] of reachByCampaign) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO meta_ad_period_reach (campaign_id, ad_account_id, date_start, date_stop, reach, fetched_at)
       VALUES ($1, $2, $3::date, $4::date, $5, NOW())
       ON CONFLICT (campaign_id, date_start, date_stop) DO UPDATE SET
         ad_account_id = EXCLUDED.ad_account_id,
         reach = EXCLUDED.reach,
         fetched_at = NOW()`,
      campaignId,
      adAccountId,
      since,
      until,
      reach
    )
  }
}

export async function markMetaAdSyncState(input: {
  ad_account_id: string
  last_since: string
  last_until: string
  last_error: string | null
  campaigns: number
  days: number
}): Promise<void> {
  await ensureMetaAdsTables()
  await prisma.$executeRawUnsafe(
    `INSERT INTO meta_ad_sync_state (
       ad_account_id, last_synced_at, last_since, last_until, last_error, campaigns, days
     ) VALUES ($1, NOW(), $2::date, $3::date, $4, $5, $6)
     ON CONFLICT (ad_account_id) DO UPDATE SET
       last_synced_at = NOW(),
       last_since = EXCLUDED.last_since,
       last_until = EXCLUDED.last_until,
       last_error = EXCLUDED.last_error,
       campaigns = EXCLUDED.campaigns,
       days = EXCLUDED.days`,
    input.ad_account_id,
    input.last_since,
    input.last_until,
    input.last_error,
    input.campaigns,
    input.days
  )
}

export type MetaAdCampaignRow = {
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
  start_time: Date | null
  stop_time: Date | null
  created_time: Date | null
  updated_time: Date | null
  last_synced_at: Date | null
}

export type MetaAdDailyStatRow = {
  campaign_id: string
  stat_date: Date
  ad_account_id: string
  spend: unknown
  impressions: unknown
  reach: unknown
  link_clicks: unknown
  landing_page_views: unknown
  leads: unknown
  cpc: unknown
  cost_per_lead: unknown
  currency: string | null
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export async function listStoredCampaigns(): Promise<MetaAdCampaignRow[]> {
  await ensureMetaAdsTables()
  const rows = await prisma.$queryRawUnsafe<MetaAdCampaignRow[]>(
    `SELECT id, ad_account_id, name, status, effective_status, objective,
            daily_budget, lifetime_budget, budget_remaining, currency,
            start_time, stop_time, created_time, updated_time, last_synced_at
       FROM meta_ad_campaigns
      ORDER BY name ASC`
  )
  return rows.map((r) => ({
    ...r,
    daily_budget: num(r.daily_budget),
    lifetime_budget: num(r.lifetime_budget),
    budget_remaining: num(r.budget_remaining),
  }))
}

export async function listDailyStats(since: string, until: string): Promise<MetaAdDailyStatRow[]> {
  await ensureMetaAdsTables()
  return prisma.$queryRawUnsafe<MetaAdDailyStatRow[]>(
    `SELECT campaign_id, stat_date, ad_account_id, spend, impressions, reach,
            link_clicks, landing_page_views, leads, cpc, cost_per_lead, currency
       FROM meta_ad_campaign_daily_stats
      WHERE stat_date >= $1::date AND stat_date <= $2::date
      ORDER BY stat_date ASC`,
    since,
    until
  )
}

export async function listPeriodReach(
  since: string,
  until: string
): Promise<{ campaign_id: string; reach: number | null; fetched_at: Date }[]> {
  await ensureMetaAdsTables()
  const rows = await prisma.$queryRawUnsafe<{ campaign_id: string; reach: unknown; fetched_at: Date }[]>(
    `SELECT campaign_id, reach, fetched_at
       FROM meta_ad_period_reach
      WHERE date_start = $1::date AND date_stop = $2::date`,
    since,
    until
  )
  return rows.map((r) => ({ campaign_id: r.campaign_id, reach: num(r.reach), fetched_at: r.fetched_at }))
}

export async function listCrmLeadsByCampaign(
  since: string,
  until: string
): Promise<Map<string, { events: number; leads: number }>> {
  await ensureMetaAdsTables()
  const rows = await prisma.$queryRawUnsafe<{ campaign_id: string; events: number; leads: number }[]>(
    `SELECT campaign_id,
            COUNT(*)::int AS events,
            COUNT(lead_id)::int AS leads
       FROM meta_lead_events
      WHERE campaign_id IS NOT NULL
        AND created_at >= $1::date
        AND created_at < ($2::date + INTERVAL '1 day')
      GROUP BY campaign_id`,
    since,
    until
  )
  const map = new Map<string, { events: number; leads: number }>()
  for (const r of rows) {
    if (r.campaign_id) map.set(r.campaign_id, { events: Number(r.events) || 0, leads: Number(r.leads) || 0 })
  }
  return map
}

export async function listSyncState(): Promise<
  { ad_account_id: string; last_synced_at: Date | null; last_error: string | null; last_since: Date | null; last_until: Date | null }[]
> {
  await ensureMetaAdsTables()
  return prisma.$queryRawUnsafe(
    `SELECT ad_account_id, last_synced_at, last_error, last_since, last_until
       FROM meta_ad_sync_state
      ORDER BY last_synced_at DESC NULLS LAST`
  )
}
