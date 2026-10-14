import { syncMetaAdsCampaigns } from '@/lib/integrations/meta/ads-sync'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloMetaAdsSyncScheduler: boolean | undefined
  // eslint-disable-next-line no-var
  var __buffaloMetaAdsSyncRunning: boolean | undefined
}

function intervalMs(): number {
  const hours = Number(process.env.META_ADS_SYNC_HOURS || 1)
  const safe = Number.isFinite(hours) && hours >= 0.25 ? hours : 1
  return safe * 60 * 60 * 1000
}

export async function runMetaAdsSyncOnce(
  reason: string,
  range?: { since?: string; until?: string }
): Promise<{ ran: boolean; skipped?: string; result?: Awaited<ReturnType<typeof syncMetaAdsCampaigns>> }> {
  if (globalThis.__buffaloMetaAdsSyncRunning) return { ran: false, skipped: 'running' }
  if (!process.env.META_ADS_ACCESS_TOKEN?.trim() && !process.env.META_PAGE_ACCESS_TOKEN?.trim() && !process.env.META_PAGE_TOKENS?.trim()) {
    return { ran: false, skipped: 'no_token' }
  }
  globalThis.__buffaloMetaAdsSyncRunning = true
  try {
    const result = await syncMetaAdsCampaigns(range)
    console.info(
      `[meta-ads] ${reason} · accounts=${result.accounts} campaigns=${result.campaigns_upserted} new=${result.campaigns_new} days=${result.days_upserted}`
    )
    return { ran: true, result }
  } finally {
    globalThis.__buffaloMetaAdsSyncRunning = false
  }
}

export function startMetaAdsSyncScheduler(): void {
  if (process.env.META_ADS_SYNC === '0') return
  if (globalThis.__buffaloMetaAdsSyncScheduler) return
  globalThis.__buffaloMetaAdsSyncScheduler = true

  const tick = () => {
    void runMetaAdsSyncOnce('scheduler').catch((e) => {
      console.warn('[meta-ads] scheduler', e instanceof Error ? e.message : e)
    })
  }

  setTimeout(tick, 90_000)
  setInterval(tick, intervalMs())
}
