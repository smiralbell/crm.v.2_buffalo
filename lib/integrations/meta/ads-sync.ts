import { addDaysIso, chunkDateRange, isoDateLocal, isIsoDate } from '@/lib/integrations/meta/ads-parse'
import {
  fetchAdAccountCampaigns,
  fetchDailyCampaignInsights,
  fetchPeriodCampaignReach,
  MetaAdsApiError,
} from '@/lib/integrations/meta/ads-graph'
import { getMetaAdsConfig } from '@/lib/integrations/meta/config'
import { resolveAdAccountIds } from '@/lib/integrations/meta/ads-access'
import {
  markMetaAdSyncState,
  upsertMetaAdCampaigns,
  upsertMetaAdDailyStats,
  upsertPeriodReach,
} from '@/lib/integrations/meta/ads-store'

export type MetaAdsSyncResult = {
  ok: boolean
  accounts: number
  campaigns_upserted: number
  campaigns_new: number
  days_upserted: number
  since: string
  until: string
  errors: { account: string; error: string }[]
}

const INCREMENTAL_DAYS = 7

function defaultUntil(): string {
  return isoDateLocal(new Date())
}

function defaultSince(until: string): string {
  return addDaysIso(until, -(INCREMENTAL_DAYS - 1))
}

export function resolveSyncWindow(input?: { since?: string; until?: string }): { since: string; until: string } {
  const until = input?.until && isIsoDate(input.until) ? input.until : defaultUntil()
  const since = input?.since && isIsoDate(input.since) ? input.since : defaultSince(until)
  if (since > until) return { since: until, until }
  return { since, until }
}

async function syncAccount(
  adAccountId: string,
  since: string,
  until: string
): Promise<{ campaigns: number; inserted: number; days: number }> {
  const campaigns = await fetchAdAccountCampaigns(adAccountId)
  const campRes = await upsertMetaAdCampaigns(campaigns)

  let days = 0
  for (const chunk of chunkDateRange(since, until, 31)) {
    const insights = await fetchDailyCampaignInsights(adAccountId, chunk.since, chunk.until)
    days += await upsertMetaAdDailyStats(insights)
  }

  try {
    const reach = await fetchPeriodCampaignReach(adAccountId, since, until)
    await upsertPeriodReach(adAccountId, since, until, reach)
  } catch (e) {
    console.warn(
      '[meta-ads] alcance del periodo no disponible',
      adAccountId,
      e instanceof Error ? e.message : e
    )
  }

  await markMetaAdSyncState({
    ad_account_id: adAccountId,
    last_since: since,
    last_until: until,
    last_error: null,
    campaigns: campRes.upserted,
    days,
  })

  return { campaigns: campRes.upserted, inserted: campRes.inserted, days }
}

export async function syncMetaAdsCampaigns(input?: {
  since?: string
  until?: string
}): Promise<MetaAdsSyncResult> {
  const cfg = getMetaAdsConfig()
  const { since, until } = resolveSyncWindow(input)
  const empty: MetaAdsSyncResult = {
    ok: false,
    accounts: 0,
    campaigns_upserted: 0,
    campaigns_new: 0,
    days_upserted: 0,
    since,
    until,
    errors: [],
  }

  if (!cfg.adsToken) {
    empty.errors.push({
      account: '—',
      error: 'Falta META_ADS_ACCESS_TOKEN (token de servidor con ads_read)',
    })
    return empty
  }

  const accounts = await resolveAdAccountIds()
  if (!accounts.length) {
    empty.errors.push({
      account: '—',
      error: 'Falta META_AD_ACCOUNT_IDS o el token no ve ninguna cuenta publicitaria',
    })
    return empty
  }

  const result: MetaAdsSyncResult = {
    ok: true,
    accounts: accounts.length,
    campaigns_upserted: 0,
    campaigns_new: 0,
    days_upserted: 0,
    since,
    until,
    errors: [],
  }

  for (const account of accounts) {
    try {
      const one = await syncAccount(account, since, until)
      result.campaigns_upserted += one.campaigns
      result.campaigns_new += one.inserted
      result.days_upserted += one.days
    } catch (e) {
      const message = e instanceof MetaAdsApiError || e instanceof Error ? e.message : 'Error al sincronizar'
      result.errors.push({ account, error: message })
      result.ok = false
      await markMetaAdSyncState({
        ad_account_id: account,
        last_since: since,
        last_until: until,
        last_error: message,
        campaigns: 0,
        days: 0,
      }).catch(() => {})
    }
  }

  return result
}
