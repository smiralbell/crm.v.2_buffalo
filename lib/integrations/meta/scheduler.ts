import { retryDueMetaLeads } from '@/lib/integrations/meta/retry'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloMetaLeadRetry: boolean | undefined
}

export function startMetaLeadRetryScheduler(): void {
  if (globalThis.__buffaloMetaLeadRetry) return
  if (process.env.META_LEAD_RETRY === '0') return
  globalThis.__buffaloMetaLeadRetry = true

  const tick = () => {
    void retryDueMetaLeads().catch((e) => {
      console.warn('[meta-leads retry]', e instanceof Error ? e.message : e)
    })
  }

  setTimeout(tick, 60_000)
  setInterval(tick, 2 * 60_000)
}
